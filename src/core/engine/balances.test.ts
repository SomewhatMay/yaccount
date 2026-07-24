import { describe, it, expect } from "vitest";
import {
  containerBalance,
  overallBalance,
  overallBalanceAsOf,
  overallBalanceSeries,
  netContributions,
  isTransfer,
} from "@/core/engine/balances";
import {
  makeContainer,
  makeTransaction,
  makeTransfer,
  makeVoidRow,
  type Transaction,
} from "@/core/model";

const tx = (over: Partial<Transaction> & { amount: number }): Transaction => ({
  ...makeTransaction({
    date: "2026-07-20",
    amount: over.amount,
    vendor_source: "x",
    category_id: "c1",
  }),
  ...over,
});

describe("containerBalance — §0.4 balance identity", () => {
  it("sums signed expense/income rows for the container", () => {
    const txns = [
      tx({ amount: 500000 }), // +$5000 income
      tx({ amount: -1000 }), // -$10 expense
      tx({ amount: -2500 }), // -$25 expense
    ];
    expect(containerBalance(txns, "general")).toBe(496500);
  });

  it("excludes pending and template rows (not live ledger, §5.4)", () => {
    const txns = [
      tx({ amount: -1000 }),
      tx({ amount: -9999, inbox_status: "pending" }),
      tx({ amount: -8888, is_template: true }),
    ];
    expect(containerBalance(txns, "general")).toBe(-1000);
  });

  it("a void nets its original to zero (both rows counted)", () => {
    const orig = makeTransaction({
      id: "t1",
      date: "2026-07-20",
      amount: -1000,
      vendor_source: "Starbucks",
      category_id: "coffee",
    });
    const voidRow = makeVoidRow(orig, { id: "v1" });
    expect(containerBalance([orig, voidRow], "general")).toBe(0);
  });

  it("credits a transfer destination via to_container_id (single-row transfer)", () => {
    // Transfer: single -$100 row on the source, destination credited by the 2nd term.
    const transfer = tx({
      amount: -10000,
      category_id: null,
      container_id: "general",
      to_container_id: "vacation",
      vendor_source: "General → Vacation",
    });
    expect(containerBalance([transfer], "general")).toBe(-10000); // source debited
    expect(containerBalance([transfer], "vacation")).toBe(10000); // dest credited
  });

  it("ignores containers not involved in a row", () => {
    expect(containerBalance([tx({ amount: -1000 })], "vacation")).toBe(0);
  });
});

const transfer = (
  from: string,
  to: string,
  amount: number,
  over: Partial<Transaction> = {},
): Transaction => ({
  ...makeTransfer({
    date: "2026-07-20",
    amount,
    container_id: from,
    to_container_id: to,
    fromName: from,
    toName: to,
  }),
  ...over,
});

describe("isTransfer — the §5.4 shape test", () => {
  it("is true only for a no-category, to_container row", () => {
    expect(isTransfer(transfer("general", "vacation", 10000))).toBe(true);
    expect(
      isTransfer(
        makeTransaction({
          date: "2026-07-20",
          amount: -1000,
          vendor_source: "Starbucks",
          category_id: "coffee",
        }),
      ),
    ).toBe(false);
  });
});

describe("overallBalance — opt-in model (§5.7)", () => {
  const general = makeContainer({
    id: "general",
    name: "General",
    include_in_overall_balance: true,
  });
  const vacation = makeContainer({ id: "vacation", name: "Vacation" }); // opt-out default

  it("counts only containers opted into the metric", () => {
    const txns = [
      tx({ amount: 100000 }), // +$1000 into general
      transfer("general", "vacation", 30000), // move $300 out to vacation
    ];
    expect(containerBalance(txns, "general")).toBe(70000);
    expect(containerBalance(txns, "vacation")).toBe(30000);
    // vacation is excluded by default → the headline is general's balance only
    expect(overallBalance(txns, [general, vacation])).toBe(70000);
  });

  it("includes a container once the user opts it in", () => {
    const optedIn = { ...vacation, include_in_overall_balance: true };
    const txns = [tx({ amount: 100000 }), transfer("general", "vacation", 30000)];
    expect(overallBalance(txns, [general, optedIn])).toBe(100000);
  });

  it("is zero when nothing is opted in", () => {
    const optedOut = { ...general, include_in_overall_balance: false };
    expect(overallBalance([tx({ amount: 100000 })], [optedOut, vacation])).toBe(0);
  });

  it("can go negative (containers may overdraw, §5.2)", () => {
    expect(overallBalance([tx({ amount: -2500 })], [general, vacation])).toBe(-2500);
  });
});

describe("netContributions — the savings-progress primitive (§5.6)", () => {
  it("counts transfers in minus transfers out, ignoring expense/income rows", () => {
    const txns = [
      transfer("general", "vacation", 30000), // +$300 in
      transfer("general", "vacation", 20000), // +$200 in
      transfer("vacation", "general", 5000), // -$50 out
      // spending FROM the container is not a withdrawal of contributions (§5.9.3)
      tx({ amount: -1000, container_id: "vacation" }),
    ];
    expect(netContributions(txns, "vacation")).toBe(45000);
    expect(containerBalance(txns, "vacation")).toBe(44000); // balance also sees the spend
  });

  it("excludes pending transfers — approval is what moves money (§10 #3)", () => {
    const txns = [
      transfer("general", "vacation", 30000),
      transfer("general", "vacation", 99900, { inbox_status: "pending" }),
    ];
    expect(netContributions(txns, "vacation")).toBe(30000);
  });

  it("is zero for a container that never received a transfer", () => {
    expect(netContributions([tx({ amount: -1000 })], "vacation")).toBe(0);
  });
});

describe("overallBalance — archived containers stop counting", () => {
  it("drops an archived container even if it was opted in", () => {
    const general = makeContainer({
      id: "general",
      name: "General",
      include_in_overall_balance: true,
    });
    const closed = makeContainer({
      id: "closed",
      name: "Old savings",
      include_in_overall_balance: true,
    });
    const txns = [tx({ amount: 100000 }), tx({ amount: 25000, container_id: "closed" })];

    expect(overallBalance(txns, [general, closed])).toBe(125000);
    // Archived = out of sight, so it must not sit invisibly in the headline.
    expect(overallBalance(txns, [general, { ...closed, is_archived: true }])).toBe(
      100000,
    );
  });

  it("still reports the archived container's own balance on demand", () => {
    expect(
      containerBalance([tx({ amount: 25000, container_id: "closed" })], "closed"),
    ).toBe(25000);
  });
});

describe("balance identity under voids and undo (§0.3 × §0.4)", () => {
  const t = transfer("general", "vacation", 30000, { id: "tr1" });

  it("a voided transfer nets BOTH legs back to zero", () => {
    const v = makeVoidRow(t, { id: "v1" });
    expect(containerBalance([t, v], "general")).toBe(0);
    expect(containerBalance([t, v], "vacation")).toBe(0);
    expect(netContributions([t, v], "vacation")).toBe(0);
  });

  it("undoing that delete restores both balances and the contribution", () => {
    const v = makeVoidRow(t, { id: "v1" });
    const u = makeVoidRow(v, { id: "u1" });
    expect(containerBalance([t, v, u], "general")).toBe(-30000);
    expect(containerBalance([t, v, u], "vacation")).toBe(30000);
    expect(netContributions([t, v, u], "vacation")).toBe(30000);
  });

  it("excludes a pending/template transfer on the DESTINATION leg too", () => {
    const pending = transfer("general", "vacation", 99900, { inbox_status: "pending" });
    const template = transfer("general", "vacation", 88800, { is_template: true });
    expect(containerBalance([pending, template], "vacation")).toBe(0);
    expect(containerBalance([pending, template], "general")).toBe(0);
    expect(netContributions([pending, template], "vacation")).toBe(0);
  });

  it("a degenerate self-transfer moves nothing", () => {
    // makeTransfer refuses to build one, but a row from an older or buggier
    // writer could carry it — the identity must still balance.
    const self = { ...t, container_id: "general", to_container_id: "general" };
    expect(containerBalance([self], "general")).toBe(0);
    expect(netContributions([self], "general")).toBe(0);
  });

  it("isTransfer rejects malformed shapes", () => {
    expect(isTransfer({ ...t, to_container_id: null })).toBe(false); // neither
    expect(isTransfer({ ...t, category_id: "coffee" })).toBe(false); // both
  });
});

describe("overallBalance — interaction with transfers (§5.7 × §0.4)", () => {
  const inA = makeContainer({ id: "a", name: "A", include_in_overall_balance: true });
  const inB = makeContainer({ id: "b", name: "B", include_in_overall_balance: true });
  const out = makeContainer({ id: "out", name: "Out" });

  it("a transfer between two counted containers leaves the headline unchanged", () => {
    const txns = [tx({ amount: 100000, container_id: "a" }), transfer("a", "b", 30000)];
    expect(overallBalance(txns, [inA, inB])).toBe(100000);
  });

  it("a transfer out to an uncounted container reduces the headline in full", () => {
    const txns = [tx({ amount: 100000, container_id: "a" }), transfer("a", "out", 30000)];
    expect(overallBalance(txns, [inA, out])).toBe(70000);
  });

  it("handles empty inputs", () => {
    expect(containerBalance([], "a")).toBe(0);
    expect(overallBalance([tx({ amount: 100000 })], [])).toBe(0);
  });
});

describe("netContributions — scope of the primitive (§5.6)", () => {
  it("counts contributions into an archived container (archive is a §5.7 rule only)", () => {
    const txns = [transfer("general", "vacation", 30000)];
    expect(netContributions(txns, "vacation")).toBe(30000);
  });

  it("excludes a template transfer", () => {
    const txns = [transfer("general", "vacation", 30000, { is_template: true })];
    expect(netContributions(txns, "vacation")).toBe(0);
  });
});

/* ── The balance through time (M11) ───────────────────────────────────────────
   What the hero figure stands on and what the register's day header carries. */

const general = makeContainer({
  id: "general",
  name: "General",
  include_in_overall_balance: true,
});
const vacation = makeContainer({ id: "vacation", name: "Vacation" }); // opt-out

/** A row built with its own date, so `yearMonth` stays derived from it. */
const on = (
  date: string,
  amount: number,
  over: Partial<Transaction> = {},
): Transaction => ({
  ...makeTransaction({ date, amount, vendor_source: "x", category_id: "c1" }),
  ...over,
});

describe("overallBalanceAsOf — the balance the day header carries (§5.7 × §12.4)", () => {
  const rows = [
    on("2026-07-01", 100000), // +$1000
    on("2026-07-10", -2500), // −$25
    on("2026-07-20", -1000), // −$10
  ];

  it("counts only what had happened by that day", () => {
    expect(overallBalanceAsOf(rows, [general], "2026-06-30")).toBe(0);
    expect(overallBalanceAsOf(rows, [general], "2026-07-01")).toBe(100000);
    expect(overallBalanceAsOf(rows, [general], "2026-07-09")).toBe(100000);
    expect(overallBalanceAsOf(rows, [general], "2026-07-10")).toBe(97500);
    expect(overallBalanceAsOf(rows, [general], "2026-07-31")).toBe(96500);
  });

  it("agrees with overallBalance once every row is behind it", () => {
    expect(overallBalanceAsOf(rows, [general, vacation], "2026-12-31")).toBe(
      overallBalance(rows, [general, vacation]),
    );
  });

  it("applies the §5.7 counted-container rule — opt-out and archived drop out", () => {
    const txns = [on("2026-07-01", 100000), transfer("general", "vacation", 30000)];
    // vacation is opt-out: the transfer leaves the counted set entirely.
    expect(overallBalanceAsOf(txns, [general, vacation], "2026-07-20")).toBe(70000);
    // opted in: the money is still yours, so the headline is unchanged.
    const optedIn = { ...vacation, include_in_overall_balance: true };
    expect(overallBalanceAsOf(txns, [general, optedIn], "2026-07-20")).toBe(100000);
    // archived beats opted-in — put away must not sit invisibly in the figure.
    expect(
      overallBalanceAsOf(
        txns,
        [general, { ...optedIn, is_archived: true }],
        "2026-07-20",
      ),
    ).toBe(70000);
  });

  it("excludes pending and template rows, like every other derivation", () => {
    const txns = [
      on("2026-07-01", 100000),
      on("2026-07-02", -9999, { inbox_status: "pending" }),
      on("2026-07-02", -8888, { is_template: true }),
    ];
    expect(overallBalanceAsOf(txns, [general], "2026-07-31")).toBe(100000);
  });

  it("shows a deleted row standing until the day its reversal is dated", () => {
    // A void is a real signed row, so the running balance nets it on ITS date —
    // which is what a check register does when you strike a line through a page.
    const orig = on("2026-07-01", -5000, { id: "t1" });
    const undo = makeVoidRow(orig, { id: "v1", on: "2026-07-15" });
    expect(overallBalanceAsOf([orig, undo], [general], "2026-07-10")).toBe(-5000);
    expect(overallBalanceAsOf([orig, undo], [general], "2026-07-15")).toBe(0);
  });

  it("is zero with no rows and with no counted containers", () => {
    expect(overallBalanceAsOf([], [general], "2026-07-20")).toBe(0);
    expect(overallBalanceAsOf(rows, [], "2026-07-20")).toBe(0);
  });
});

describe("overallBalanceSeries — the ground the hero figure stands on", () => {
  const rows = [
    on("2026-07-01", 100000),
    on("2026-07-10", -2500),
    on("2026-07-20", -1000),
  ];
  const days = ["2026-06-30", "2026-07-01", "2026-07-10", "2026-07-20", "2026-07-21"];

  it("returns one reading per day asked for, in that order", () => {
    expect(overallBalanceSeries(rows, [general], days)).toEqual([
      0, 100000, 97500, 96500, 96500,
    ]);
  });

  it("agrees with overallBalanceAsOf on every day", () => {
    expect(overallBalanceSeries(rows, [general], days)).toEqual(
      days.map((d) => overallBalanceAsOf(rows, [general], d)),
    );
  });

  it("answers in the caller's order even when the days are not sorted", () => {
    // A running total is computed ascending; a caller handing them over shuffled
    // must still get the right number beside each day, not a silently wrong curve.
    const shuffled = ["2026-07-20", "2026-06-30", "2026-07-10"];
    expect(overallBalanceSeries(rows, [general], shuffled)).toEqual([96500, 0, 97500]);
  });

  it("handles empty inputs", () => {
    expect(overallBalanceSeries(rows, [general], [])).toEqual([]);
    expect(overallBalanceSeries([], [general], ["2026-07-20"])).toEqual([0]);
  });

  it("carries a repeated day at the same reading", () => {
    expect(overallBalanceSeries(rows, [general], ["2026-07-10", "2026-07-10"])).toEqual([
      97500, 97500,
    ]);
  });

  it("counts both legs of a transfer between counted containers", () => {
    const optedIn = { ...vacation, include_in_overall_balance: true };
    const txns = [
      on("2026-07-01", 100000),
      { ...transfer("general", "vacation", 30000), date: "2026-07-05" },
    ];
    // Own money moving between two counted containers changes nothing.
    expect(
      overallBalanceSeries(txns, [general, optedIn], ["2026-07-01", "2026-07-05"]),
    ).toEqual([100000, 100000]);
    // Moving it OUT of the counted set is a real reduction.
    expect(
      overallBalanceSeries(txns, [general, vacation], ["2026-07-01", "2026-07-05"]),
    ).toEqual([100000, 70000]);
  });
});
