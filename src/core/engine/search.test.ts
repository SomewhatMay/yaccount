import { describe, it, expect } from "vitest";
import {
  buildSearchIndex,
  buildEntrySearchDocs,
  createProgressiveSearch,
  createSession,
  matchRanges,
  NO_QUERY,
  parseQuery,
  search,
  type SearchResult,
} from "./search";
import {
  makeCategory,
  makeContainer,
  makeGeneralContainer,
  makeGoal,
  makeRecurringRule,
  makeTemplate,
  makeTransaction,
  makeTransfer,
  makeVoidRow,
} from "../model";

/**
 * The parser's one promise: nothing you type can fail. A token becomes a
 * constraint only when it matches its shape exactly; everything else — a stray
 * `$`, a mistyped `is:`, a hyphen in a payee — falls back to being a word.
 */
describe("parseQuery — words unless the token is unmistakably a constraint", () => {
  it("reads a blank box as no constraint at all", () => {
    expect(parseQuery("")).toEqual(NO_QUERY);
    expect(parseQuery("   ")).toEqual(NO_QUERY);
  });

  it("lowercases and splits free words", () => {
    expect(parseQuery("Blue  Bottle Coffee").words).toEqual([
      "blue",
      "bottle",
      "coffee",
    ]);
  });

  it("reads > and < as inclusive size bounds, in cents", () => {
    expect(parseQuery(">100")).toMatchObject({ min: 10000, max: null, words: [] });
    expect(parseQuery("<50")).toMatchObject({ min: null, max: 5000, words: [] });
    expect(parseQuery(">$12.34").min).toBe(1234);
    expect(parseQuery(">=100").min).toBe(10000);
    expect(parseQuery("<=100").max).toBe(10000);
  });

  it("reads N-N as a size window", () => {
    expect(parseQuery("20-80")).toMatchObject({ min: 2000, max: 8000, words: [] });
    expect(parseQuery("$20-$80")).toMatchObject({ min: 2000, max: 8000 });
  });

  it("reads a $-prefixed amount as an exact size, but a bare number as a word", () => {
    expect(parseQuery("$42.50")).toMatchObject({ exact: 4250, words: [] });
    // "Store 100" is a payee. The formatted amount is indexed as text anyway,
    // so a bare number still finds the entry — as a word, which cannot lie.
    expect(parseQuery("100")).toMatchObject({ exact: null, words: ["100"] });
  });

  it("reads YYYY-MM and YYYY-MM-DD as a date window", () => {
    expect(parseQuery("2026-07").range).toEqual({
      start: "2026-07-01",
      end: "2026-07-31",
    });
    expect(parseQuery("2026-02").range).toEqual({
      start: "2026-02-01",
      end: "2026-02-28",
    });
    expect(parseQuery("2024-02").range).toEqual({
      start: "2024-02-01",
      end: "2024-02-29", // leap year
    });
    expect(parseQuery("2026-07-14").range).toEqual({
      start: "2026-07-14",
      end: "2026-07-14",
    });
  });

  it("leaves a bare year as a word — the indexed date string matches it anyway", () => {
    expect(parseQuery("2026")).toMatchObject({ range: null, words: ["2026"] });
  });

  it("reads is: for kinds and for the two states", () => {
    expect(parseQuery("is:expense").kinds).toEqual(["expense"]);
    expect(parseQuery("is:income is:transfer").kinds).toEqual(["income", "transfer"]);
    expect(parseQuery("is:pending").flags).toEqual(["pending"]);
    expect(parseQuery("is:template").flags).toEqual(["template"]);
    expect(parseQuery("is:archived").flags).toEqual(["archived"]);
  });

  it("reads in: and cat: as facet text", () => {
    expect(parseQuery("in:chequing").containerText).toEqual(["chequing"]);
    expect(parseQuery("cat:groceries").categoryText).toEqual(["groceries"]);
    expect(parseQuery("IN:Chequing").containerText).toEqual(["chequing"]);
  });

  it("degrades every malformed token to a plain word", () => {
    expect(parseQuery("$").words).toEqual(["$"]);
    expect(parseQuery("-").words).toEqual(["-"]);
    expect(parseQuery(">").words).toEqual([">"]);
    expect(parseQuery("is:nope").words).toEqual(["is:nope"]);
    expect(parseQuery("in:").words).toEqual(["in:"]);
    expect(parseQuery("2026-13").words).toEqual(["2026-13"]);
    expect(parseQuery("2026-02-30").words).toEqual(["2026-02-30"]);
    expect(parseQuery("mercedes-benz").words).toEqual(["mercedes-benz"]);
    expect(parseQuery(">abc").words).toEqual([">abc"]);
  });

  it("mixes words and constraints in one box", () => {
    expect(parseQuery("coffee is:expense >5 2026-07")).toMatchObject({
      words: ["coffee"],
      kinds: ["expense"],
      min: 500,
      range: { start: "2026-07-01", end: "2026-07-31" },
    });
  });

  it("keeps the last of two competing bounds rather than dropping one", () => {
    expect(parseQuery(">10 >20").min).toBe(2000);
  });
});

// ── the index and the ranking ──────────────────────────────────────────────

const cats = [
  makeCategory({ id: "c_groc", name: "Groceries", type: "expense" }),
  makeCategory({ id: "c_coffee", name: "Coffee", type: "expense" }),
  makeCategory({ id: "c_salary", name: "Salary", type: "income" }),
  {
    ...makeCategory({ id: "c_old", name: "Cable TV", type: "expense" }),
    is_archived: true,
  },
];

const conts = [
  makeGeneralContainer(),
  makeContainer({ id: "chq", name: "Chequing" }),
  makeContainer({ id: "sav", name: "Savings" }),
];

const tx = {
  coffee: makeTransaction({
    id: "t_coffee",
    date: "2026-07-14",
    amount: -525,
    vendor_source: "Blue Bottle Coffee",
    category_id: "c_coffee",
    container_id: "chq",
    notes: "meeting with Dana about the roastery lease",
    entered_at: "2026-07-14T09:00:00.000Z",
  }),
  groceries: makeTransaction({
    id: "t_groc",
    date: "2026-07-20",
    amount: -4250,
    vendor_source: "Whole Foods",
    category_id: "c_groc",
    container_id: "chq",
    entered_at: "2026-07-20T18:00:00.000Z",
  }),
  pay: makeTransaction({
    id: "t_pay",
    date: "2026-06-30",
    amount: 214000,
    vendor_source: "Acme Payroll",
    category_id: "c_salary",
    container_id: "chq",
    entered_at: "2026-06-30T12:00:00.000Z",
  }),
  move: makeTransfer({
    id: "t_move",
    date: "2026-07-01",
    amount: 50000,
    container_id: "chq",
    to_container_id: "sav",
    fromName: "Chequing",
    toName: "Savings",
    entered_at: "2026-07-01T08:00:00.000Z",
  }),
  shortcut: makeTemplate({
    id: "t_tpl",
    template_name: "Morning latte",
    amount: -450,
    vendor_source: "Blue Bottle Coffee",
    container_id: "chq",
    category_id: "c_coffee",
  }),
};

const goals = [
  makeGoal({
    id: "g_japan",
    container_id: "sav",
    kind: "reserve",
    mode: "fixed",
    created_date: "2026-01-01",
    name: "Japan trip",
    target_amount: 500000,
    planned_monthly: 25000,
  }),
];

const rules = [
  makeRecurringRule({
    id: "r_rent",
    frequency: "monthly",
    interval_config: { day_of_month: 1 },
    template_vendor_source: "Landlord Rent",
    template_container_id: "chq",
    template_category_id: "c_groc",
    template_amount: -180000,
    start_date: "2026-01-01",
  }),
];

const WORLD = {
  transactions: Object.values(tx),
  categories: cats,
  containers: conts,
  goals,
  rules,
};

const index = buildSearchIndex(WORLD);
const ids = (rs: SearchResult[]) => rs.map((r) => r.doc.id);
const find = (q: string) => ids(search(index, q, { limit: 50, perKind: 50 }));

describe("buildSearchIndex — every field of every entity is reachable", () => {
  it("finds an entry by its payee", () => {
    expect(find("whole foods")).toContain("t_groc");
  });

  it("finds an entry by a word buried in its NOTES", () => {
    expect(find("roastery")).toContain("t_coffee");
    expect(find("dana lease")).toContain("t_coffee");
  });

  it("finds an entry by its amount, typed either way", () => {
    expect(find("42.50")).toContain("t_groc");
    expect(find("$42.50")).toContain("t_groc");
    expect(find("2,140")).toContain("t_pay");
  });

  it("finds an entry by its category name", () => {
    expect(find("salary")).toContain("t_pay");
  });

  it("finds an entry by its date", () => {
    expect(find("2026-07-20")).toContain("t_groc");
  });

  it("finds a transfer by EITHER container name", () => {
    expect(find("chequing")).toContain("t_move");
    expect(find("savings")).toContain("t_move");
  });

  it("finds a shortcut by its template name", () => {
    expect(find("morning latte")).toContain("t_tpl");
  });

  it("finds the things that are not entries at all", () => {
    expect(find("groceries")).toContain("c_groc");
    expect(find("chequing")).toContain("chq");
    expect(find("japan")).toContain("g_japan");
    expect(find("landlord")).toContain("r_rent");
  });

  it("indexes the extras the shell hands it — screens and actions", () => {
    const withShell = buildSearchIndex({
      ...WORLD,
      extras: [
        {
          id: "/goals",
          kind: "destination",
          title: "Goals",
          subtitle: "What you are saving toward",
        },
        { id: "act:sync", kind: "action", title: "Sync with Drive now", subtitle: "" },
      ],
    });
    expect(ids(search(withShell, "goals"))).toContain("/goals");
    expect(ids(search(withShell, "drive"))).toContain("act:sync");
  });

  it("leaves a voided row and its reversal out entirely", () => {
    const voided = buildSearchIndex({
      ...WORLD,
      transactions: [...WORLD.transactions, makeVoidRow(tx.groceries, { id: "v1" })],
    });
    expect(ids(search(voided, "whole foods"))).toEqual([]);
  });
});

describe("progressive Search", () => {
  it("publishes improving bounded results and ends with full-index parity", () => {
    const base = buildSearchIndex({ ...WORLD, transactions: [] });
    const entries = buildEntrySearchDocs(Object.values(tx), cats, conts);
    const progressive = createProgressiveSearch(base, "blue bottle", {
      limit: 24,
      perKind: 5,
    });

    expect(progressive.complete).toBe(false);
    expect(progressive.add(entries.slice(1))).toEqual(
      search(
        { docs: [...base.docs, ...entries.slice(1)] },
        "blue bottle",
        { limit: 24, perKind: 5 },
      ),
    );
    expect(progressive.add(entries.slice(0, 1)).map((result) => result.doc.id)).toContain(
      "t_coffee",
    );
    expect(progressive.finish()).toEqual(
      search(index, "blue bottle", { limit: 24, perKind: 5 }),
    );
    expect(progressive.complete).toBe(true);
  });
});

describe("search — ranked by how well it matched, not by what came first", () => {
  const plain = (id: string, vendor: string, notes?: string) =>
    makeTransaction({
      id,
      date: "2026-07-02",
      amount: -100,
      vendor_source: vendor,
      category_id: "c_groc",
      notes: notes ?? null,
      entered_at: "2026-07-02T00:00:00.000Z",
    });

  it("puts an exact title above a prefix, above a word start, above a buried hit", () => {
    const world = buildSearchIndex({
      transactions: [
        plain("x_sub", "Uncoffeed Ltd"),
        plain("x_word", "Blue Coffee"),
        plain("x_prefix", "Coffee House"),
        plain("x_exact", "Coffee"),
        plain("x_notes", "Zed", "coffee for the office"),
      ],
      categories: [],
      containers: conts,
      goals: [],
      rules: [],
    });
    expect(ids(search(world, "coffee", { limit: 5, perKind: 50 }))).toEqual([
      "x_exact",
      "x_prefix",
      "x_word",
      "x_sub",
      "x_notes",
    ]);
  });

  it("breaks a tie by recency, then name, then id — never by luck", () => {
    const same = (id: string, entered: string, vendor: string) =>
      makeTransaction({
        id,
        date: "2026-07-02",
        amount: -100,
        vendor_source: vendor,
        category_id: "c_groc",
        entered_at: entered,
      });
    const world = buildSearchIndex({
      transactions: [
        same("t_b", "2026-07-02T01:00:00.000Z", "Same Payee b"),
        same("t_a", "2026-07-02T01:00:00.000Z", "Same Payee a"),
        same("t_new", "2026-07-09T01:00:00.000Z", "Same Payee z"),
      ],
      categories: [],
      containers: [],
      goals: [],
      rules: [],
    });
    expect(ids(search(world, "same payee"))).toEqual(["t_new", "t_a", "t_b"]);
  });

  it("keeps an archived thing findable, but never in the way", () => {
    expect(find("cable")).toContain("c_old");
    const ranked = find("c");
    expect(ranked.indexOf("c_old")).toBeGreaterThan(ranked.indexOf("c_coffee"));
  });

  it("returns a sensible default when nothing is typed", () => {
    const withShell = buildSearchIndex({
      ...WORLD,
      extras: [{ id: "/goals", kind: "destination", title: "Goals", subtitle: "" }],
    });
    expect(ids(search(withShell, ""))[0]).toBe("/goals");
  });

  it("caps per kind so one flood cannot crowd out the rest", () => {
    const results = search(index, "c", { limit: 20, perKind: 1 });
    const kinds = results.map((r) => r.doc.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
  });
});

describe("search — the constraint tokens actually constrain", () => {
  it("narrows by size — over anything that carries an amount", () => {
    // A recurring rule has a real amount, so a money question reaches it too;
    // a goal's target does not (it is a set-point, not money that moved).
    expect(find(">1000")).toEqual(["r_rent", "t_pay"]);
    expect(find("<6")).toEqual(["t_tpl", "t_coffee"]);
    expect(find("$42.50")).toEqual(["t_groc"]);
  });

  it("narrows by date window", () => {
    expect(find("2026-06")).toEqual(["t_pay"]);
  });

  it("narrows by kind and by state", () => {
    expect(find("is:transfer")).toEqual(["t_move"]);
    expect(find("is:income")).toEqual(["t_pay"]);
    expect(find("is:template")).toEqual(["t_tpl"]);
  });

  it("narrows by container and category text", () => {
    // The container itself answers "in:savings", and so does the goal kept
    // there — anything that lives in that wallet, not only entries.
    expect(find("in:savings")).toEqual(["sav", "g_japan", "t_move"]);
    expect(find("cat:coffee")).toEqual(expect.arrayContaining(["t_coffee", "t_tpl"]));
  });

  it("drops the things a money question cannot be asked of", () => {
    expect(find(">1000")).not.toContain("c_groc");
  });

  it("composes words with constraints", () => {
    expect(find("coffee is:expense <10")).toEqual(["t_coffee"]);
  });
});

// ── typing, at scale ───────────────────────────────────────────────────────

/** A ledger big enough that the difference between O(n) and O(matches) shows. */
function bigLedger(n: number) {
  const transactions = [];
  for (let i = 0; i < n; i += 1) {
    transactions.push(
      makeTransaction({
        id: `b${i}`,
        date: "2026-03-01",
        amount: -(100 + i),
        vendor_source: `Payee ${i}`,
        category_id: "c_groc",
        entered_at: `2026-03-01T00:00:00.${String(i % 1000).padStart(3, "0")}Z`,
      }),
    );
  }
  transactions.push(
    makeTransaction({
      id: "needle",
      date: "2026-03-02",
      amount: -999,
      vendor_source: "Kaleidoscope Bakery",
      category_id: "c_groc",
      notes: "birthday cake for Wren",
      entered_at: "2026-03-02T00:00:00.000Z",
    }),
  );
  return { transactions, categories: cats, containers: conts, goals: [], rules: [] };
}

describe("createSession — typing rescans what still matched, not the whole ledger", () => {
  const big = buildSearchIndex(bigLedger(5000));

  it("agrees with a cold search at every keystroke", () => {
    const session = createSession(big);
    for (const q of ["k", "ka", "kal", "kale", "kaleido", "kaleidoscope zzz"]) {
      expect(session.search(q)).toEqual(search(big, q));
    }
  });

  it("agrees when the query is edited backwards, not only extended", () => {
    const session = createSession(big);
    for (const q of ["kaleido", "kale", "payee 7", "payee", ""]) {
      expect(session.search(q)).toEqual(search(big, q));
    }
  });

  it("falls to the survivors after the first keystroke", () => {
    const session = createSession(big);
    const scanned: number[] = [];
    for (const q of ["k", "ka", "kal", "kale"]) {
      session.search(q);
      scanned.push(session.scanned);
    }
    expect(scanned[0]).toBeGreaterThan(4000); // the cold pass sees everything
    for (const n of scanned.slice(1)) {
      expect(n).toBeLessThanOrEqual(scanned[0]);
      expect(n).toBeLessThan(20); // thereafter, only what still matched
    }
  });

  it("still finds the one row by a word in its notes, among five thousand", () => {
    expect(search(big, "birthday wren").map((r) => r.doc.id)).toEqual(["needle"]);
  });

  it("re-narrows correctly when a constraint token changes", () => {
    const session = createSession(big);
    // ">5" is not an extension of ">50" — the candidate set must be rebuilt.
    expect(session.search("payee >50")).toEqual(search(big, "payee >50"));
    expect(session.search("payee >5")).toEqual(search(big, "payee >5"));
  });
});

describe("matchRanges — what to underline in a result", () => {
  it("finds each word, ignoring case", () => {
    expect(matchRanges("Blue Bottle Coffee", ["coffee"])).toEqual([[12, 18]]);
    expect(matchRanges("Blue Bottle Coffee", ["blue", "coffee"])).toEqual([
      [0, 4],
      [12, 18],
    ]);
  });

  it("merges overlapping hits into one run", () => {
    expect(matchRanges("aaa", ["aa", "a"])).toEqual([[0, 3]]);
  });

  it("marks every occurrence, not just the first", () => {
    expect(matchRanges("cocoa co", ["co"])).toEqual([
      [0, 2],
      [2, 4],
      [6, 8],
    ]);
  });

  it("says nothing when there is nothing to say", () => {
    expect(matchRanges("Blue Bottle", [])).toEqual([]);
    expect(matchRanges("Blue Bottle", ["zzz"])).toEqual([]);
    expect(matchRanges("", ["a"])).toEqual([]);
  });
});
