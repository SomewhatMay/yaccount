import { formatCents, parseDollars, type Cents } from "../money";
import { isCalendarDate } from "../model/primitives";
import type {
  Category,
  Container,
  Goal,
  RecurringRule,
  Transaction,
} from "../model";
import { inRange, type DateRange } from "./period";
import { TRANSACTION_KINDS, transactionKind, type TransactionKind } from "./filter";
import { activeRows, pendingRows, templateRows } from "./ledger";

/**
 * ⌘K search — one ranked answer over everything the app holds.
 *
 * Three jobs live here, in order: read the box (`parseQuery`), turn the data into
 * something cheap to scan (`buildSearchIndex`), and rank what matches (`search`,
 * or `createSession` when the same box is being typed into).
 *
 * Pure and clock-free like the rest of the engine (§ `filter.ts`). That matters
 * more than usual here: "recent" is a tempting score term, but a score that moves
 * with the wall clock is a search whose results cannot be written down in a test.
 * Recency is a TIEBREAK over stored ISO strings instead — the same four-key chain
 * `usage-ranking.ts` sorts by, so two devices agree on the order of equals.
 */

/** A state a row can be in that is not a kind — the `is:` words that aren't kinds. */
export const SEARCH_FLAGS = ["pending", "template", "archived"] as const;
export type SearchFlag = (typeof SEARCH_FLAGS)[number];

export interface SearchQuery {
  /** Free text. Every word must land somewhere, in any order (as the rail does). */
  words: string[];
  /** Inclusive bounds on the SIZE of an entry, in cents — as `TransactionFilter`. */
  min: Cents | null;
  max: Cents | null;
  /** An exact size, from a `$`-prefixed token. */
  exact: Cents | null;
  range: DateRange | null;
  kinds: TransactionKind[];
  flags: SearchFlag[];
  /** `cat:` / `in:` — matched against the row's category and container names. */
  categoryText: string[];
  containerText: string[];
}

/** An empty box constrains nothing. */
export const NO_QUERY: SearchQuery = {
  words: [],
  min: null,
  max: null,
  exact: null,
  range: null,
  kinds: [],
  flags: [],
  categoryText: [],
  containerText: [],
};

const KIND_SET = new Set<string>(TRANSACTION_KINDS);
const FLAG_SET = new Set<string>(SEARCH_FLAGS);

/** Cents, or null if this is not money. `parseDollars` throws by design (§money). */
function money(raw: string): Cents | null {
  if (raw === "") return null;
  try {
    const c = parseDollars(raw);
    return c < 0 ? null : c; // a bound is a size; "-50" is not one
  } catch {
    return null;
  }
}

/** Last day of a 1-based month — day 0 of the next one, as `isCalendarDate` does. */
function monthEnd(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * A date token, or null. `YYYY-MM` widens to the whole month; `YYYY-MM-DD` is
 * that one day. A bare `YYYY` is deliberately NOT a date: it is far more often
 * part of a note or a payee, and the indexed date string matches it as a word
 * regardless — so nothing is lost by leaving it alone.
 */
function dateWindow(token: string): DateRange | null {
  if (/^\d{4}-\d{2}$/.test(token)) {
    const [y, m] = token.split("-").map(Number);
    if (m < 1 || m > 12) return null;
    const end = String(monthEnd(y, m)).padStart(2, "0");
    return { start: `${token}-01`, end: `${token}-${end}` };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(token) && isCalendarDate(token)) {
    return { start: token, end: token };
  }
  return null;
}

/**
 * Read the search box.
 *
 * The rule that makes this safe to put in front of a user: a token is a
 * constraint only when it matches its shape completely, and otherwise it stays a
 * word. `is:nope`, `mercedes-benz`, `$` and `2026-13` are all just text, so no
 * query can be "wrong" — the worst case is that it finds nothing, which is an
 * answer rather than an error.
 */
export function parseQuery(raw: string): SearchQuery {
  // Fresh arrays, not `NO_QUERY`'s — that constant is shared and must stay empty.
  const q: SearchQuery = {
    words: [],
    min: null,
    max: null,
    exact: null,
    range: null,
    kinds: [],
    flags: [],
    categoryText: [],
    containerText: [],
  };

  for (const token of raw.trim().split(/\s+/).filter(Boolean)) {
    const lower = token.toLowerCase();

    // is: / in: / cat: — an unknown value after the colon is not a facet.
    const facet = /^(is|in|cat):(.*)$/.exec(lower);
    if (facet) {
      const [, name, value] = facet;
      if (value !== "") {
        if (name === "is" && KIND_SET.has(value)) {
          if (!q.kinds.includes(value as TransactionKind))
            q.kinds.push(value as TransactionKind);
          continue;
        }
        if (name === "is" && FLAG_SET.has(value)) {
          if (!q.flags.includes(value as SearchFlag)) q.flags.push(value as SearchFlag);
          continue;
        }
        if (name === "in") {
          q.containerText.push(value);
          continue;
        }
        if (name === "cat") {
          q.categoryText.push(value);
          continue;
        }
      }
      q.words.push(lower);
      continue;
    }

    // Dates before ranges: "2026-07" is a month, not "$2026 to $7".
    const window = dateWindow(lower);
    if (window) {
      q.range = window;
      continue;
    }

    const bound = /^(>=|<=|>|<)(.+)$/.exec(lower);
    if (bound) {
      const value = money(bound[2]);
      if (value !== null) {
        if (bound[1].startsWith(">")) q.min = value;
        else q.max = value;
        continue;
      }
      q.words.push(lower);
      continue;
    }

    // "20-80" — a window. Both sides must be money AND in order, which is what
    // keeps "2026-13" and "mercedes-benz" out.
    const dash = lower.indexOf("-");
    if (dash > 0) {
      const lo = money(lower.slice(0, dash));
      const hi = money(lower.slice(dash + 1));
      if (lo !== null && hi !== null && lo <= hi) {
        q.min = lo;
        q.max = hi;
        continue;
      }
    }

    // "$42.50" — an exact size. Only with the `$`, so "Store 100" stays a payee.
    if (lower.startsWith("$")) {
      const value = money(lower);
      if (value !== null) {
        q.exact = value;
        continue;
      }
    }

    q.words.push(lower);
  }

  return q;
}

// ── the index ──────────────────────────────────────────────────────────────

/**
 * What a result IS. The order is the order the palette groups in: where you can
 * go, what you can do, then the data itself.
 */
export const DOC_KINDS = [
  "destination",
  "action",
  "transaction",
  "template",
  "category",
  "container",
  "goal",
  "rule",
] as const;
export type DocKind = (typeof DOC_KINDS)[number];

/**
 * One searchable thing, with its text ALREADY LOWERCASED.
 *
 * That is the whole performance argument. The old palette rebuilt a template
 * string and lowercased it for every row on every keystroke; at a few thousand
 * entries that is thousands of throwaway allocations per character typed. Doing
 * it once per entity per data change turns a keystroke into a handful of
 * `indexOf` calls over strings that already exist.
 */
export interface SearchDoc {
  id: string;
  kind: DocKind;
  /** For display — original case. */
  title: string;
  subtitle: string;
  /** The right-aligned column: an amount where the thing has one. */
  meta: string;
  /** `title`, lowercased. Prefix and exact scoring read this. */
  key: string;
  /** Everything: title, notes, category, containers, formatted amount, date. */
  hay: string;
  /** Size in cents, for `>`/`<`/`$` — null for things a size cannot be asked of. */
  amount: Cents | null;
  /** The calendar day, for a date window — null for undated things. */
  date: string | null;
  /** The tiebreak: `entered_at` where there is one. */
  recency: string;
  txKind: TransactionKind | null;
  pending: boolean;
  template: boolean;
  archived: boolean;
  categoryHay: string;
  containerHay: string;
}

/** A doc the shell supplies — a screen or an action. The engine knows neither. */
export interface SearchExtra {
  id: string;
  kind: DocKind;
  title: string;
  subtitle: string;
}

export interface SearchInput {
  transactions: Transaction[];
  categories: Category[];
  containers: Container[];
  goals: Goal[];
  rules: RecurringRule[];
  extras?: SearchExtra[];
}

export interface SearchIndex {
  docs: SearchDoc[];
}

export interface SearchResult {
  doc: SearchDoc;
  score: number;
}

/** Sits above every kind-specific score so a screen wins a one-letter query. */
const KIND_BASE: Record<DocKind, number> = {
  destination: 60,
  action: 50,
  category: 40,
  container: 40,
  goal: 35,
  rule: 30,
  template: 25,
  transaction: 20,
};

/** Enough to sink an archived row below any live one, never enough to hide it. */
const ARCHIVED_PENALTY = 150;

function lower(parts: (string | null | undefined)[]): string {
  return parts.filter((p) => p != null && p !== "").join(" ").toLowerCase();
}

/**
 * Build the index. Linear in the data, run once per data change — never per
 * keystroke.
 */
export function buildSearchIndex(input: SearchInput): SearchIndex {
  const catName = new Map(input.categories.map((c) => [c.id, c.name]));
  const contName = new Map(input.containers.map((c) => [c.id, c.name]));
  const docs: SearchDoc[] = [];

  for (const extra of input.extras ?? []) {
    docs.push({
      ...extra,
      meta: "",
      key: extra.title.toLowerCase(),
      hay: lower([extra.title, extra.subtitle]),
      amount: null,
      date: null,
      recency: "",
      txKind: null,
      pending: false,
      template: false,
      archived: false,
      categoryHay: "",
      containerHay: "",
    });
  }

  // Live entries, the Inbox queue and saved shortcuts — everything a person
  // would call "an entry". A voided row and its reversal are bookkeeping for
  // something that no longer happened, so neither is findable.
  const entries = [
    ...activeRows(input.transactions),
    ...pendingRows(input.transactions),
    ...templateRows(input.transactions),
  ];

  for (const t of entries) {
    const category = t.category_id ? (catName.get(t.category_id) ?? "") : "";
    const from = contName.get(t.container_id) ?? "";
    const to = t.to_container_id ? (contName.get(t.to_container_id) ?? "") : "";
    const title = t.is_template ? (t.template_name ?? t.vendor_source) : t.vendor_source;
    const containers = lower([from, to]);
    docs.push({
      id: t.id,
      kind: t.is_template ? "template" : "transaction",
      title,
      subtitle: t.is_template
        ? t.vendor_source
        : `${category || (t.to_container_id ? "Transfer" : "")} · ${t.date}`,
      meta: formatCents(t.amount),
      key: title.toLowerCase(),
      hay: lower([
        title,
        t.vendor_source,
        t.notes,
        category,
        from,
        to,
        formatCents(t.amount),
        t.is_template ? "" : t.date,
      ]),
      amount: Math.abs(t.amount),
      // A template has no place on the calendar (§5.8) — its `date` is an
      // anchor, so a date window must not appear to answer for it.
      date: t.is_template ? null : t.date,
      recency: t.entered_at ?? `${t.date}T00:00:00.000Z`,
      // `is:expense|income|transfer` asks about ENTRIES. A shortcut is not one;
      // `is:template` is how you ask for those.
      txKind: t.is_template ? null : transactionKind(t),
      pending: t.inbox_status === "pending",
      template: t.is_template,
      archived: false,
      categoryHay: category.toLowerCase(),
      containerHay: containers,
    });
  }

  for (const c of input.categories) {
    docs.push({
      id: c.id,
      kind: "category",
      title: c.name,
      subtitle: c.type === "income" ? "Income category" : "Expense category",
      meta: "",
      key: c.name.toLowerCase(),
      hay: lower([c.name, c.type]),
      amount: null,
      date: null,
      recency: "",
      txKind: null,
      pending: false,
      template: false,
      archived: c.is_archived,
      categoryHay: c.name.toLowerCase(),
      containerHay: "",
    });
  }

  for (const c of input.containers) {
    docs.push({
      id: c.id,
      kind: "container",
      title: c.name,
      subtitle: c.is_investment ? "Investment container" : "Container",
      meta: "",
      key: c.name.toLowerCase(),
      hay: lower([c.name, c.is_investment ? "investment" : ""]),
      amount: null,
      date: null,
      recency: "",
      txKind: null,
      pending: false,
      template: false,
      archived: c.is_archived,
      categoryHay: "",
      containerHay: c.name.toLowerCase(),
    });
  }

  for (const g of input.goals) {
    const container = contName.get(g.container_id) ?? "";
    const title = g.name ?? container;
    docs.push({
      id: g.id,
      kind: "goal",
      title,
      subtitle: container,
      meta: g.target_amount === null ? "" : formatCents(g.target_amount),
      key: title.toLowerCase(),
      hay: lower([
        title,
        container,
        g.kind,
        g.mode,
        g.target_amount === null ? "" : formatCents(g.target_amount),
      ]),
      // A goal's target is a set-point, not the size of an entry — a `>100`
      // question is about money that moved, so a goal cannot answer it.
      amount: null,
      date: null,
      recency: g.created_date === "" ? "" : `${g.created_date}T00:00:00.000Z`,
      txKind: null,
      pending: false,
      template: false,
      archived: g.is_archived || g.status === "cancelled",
      categoryHay: "",
      containerHay: container.toLowerCase(),
    });
  }

  for (const r of input.rules) {
    const category = r.template_category_id
      ? (catName.get(r.template_category_id) ?? "")
      : "";
    const from = contName.get(r.template_container_id) ?? "";
    const to = r.template_to_container_id
      ? (contName.get(r.template_to_container_id) ?? "")
      : "";
    docs.push({
      id: r.id,
      kind: "rule",
      title: r.template_vendor_source,
      subtitle: r.frequency,
      meta: r.template_amount === null ? "" : formatCents(r.template_amount),
      key: r.template_vendor_source.toLowerCase(),
      hay: lower([
        r.template_vendor_source,
        category,
        from,
        to,
        r.frequency,
        r.template_amount === null ? "" : formatCents(r.template_amount),
      ]),
      amount: r.template_amount === null ? null : Math.abs(r.template_amount),
      // A rule is a schedule, not a day. Its dates are `start`/`next`, and
      // answering a date window with either would be a guess.
      date: null,
      recency: `${r.start_date}T00:00:00.000Z`,
      txKind: null,
      pending: false,
      template: false,
      archived: r.status === "cancelled",
      categoryHay: category.toLowerCase(),
      containerHay: lower([from, to]),
    });
  }

  return { docs };
}

// ── matching and ranking ───────────────────────────────────────────────────

const TIER_EXACT = 1000;
const TIER_PREFIX = 700;
const TIER_WORD = 400;
const TIER_SUBSTRING = 200;
const TIER_BURIED = 80;

/**
 * Does `word` start a word inside `hay`? Cheaper than a RegExp built per
 * keystroke, and `hay` is already lowercase so only ASCII alphanumerics can be
 * "inside" a word — anything else counts as a boundary.
 */
function startsAWord(hay: string, word: string): boolean {
  let i = hay.indexOf(word);
  while (i !== -1) {
    if (i === 0) return true;
    const prev = hay.charCodeAt(i - 1);
    const inWord = (prev >= 48 && prev <= 57) || (prev >= 97 && prev <= 122);
    if (!inWord) return true;
    i = hay.indexOf(word, i + 1);
  }
  return false;
}

/** How well one word landed. 0 = it did not. */
function tier(doc: SearchDoc, word: string): number {
  if (doc.key === word) return TIER_EXACT;
  if (doc.key.startsWith(word)) return TIER_PREFIX;
  if (startsAWord(doc.key, word)) return TIER_WORD;
  if (doc.key.includes(word)) return TIER_SUBSTRING;
  if (doc.hay.includes(word)) return TIER_BURIED;
  return 0;
}

/** The hard half: a constraint a doc cannot answer is a constraint it fails. */
function passes(doc: SearchDoc, q: SearchQuery): boolean {
  if (q.min !== null && (doc.amount === null || doc.amount < q.min)) return false;
  if (q.max !== null && (doc.amount === null || doc.amount > q.max)) return false;
  if (q.exact !== null && doc.amount !== q.exact) return false;
  if (q.range !== null && (doc.date === null || !inRange(doc.date, q.range))) return false;
  if (q.kinds.length > 0 && (doc.txKind === null || !q.kinds.includes(doc.txKind)))
    return false;
  for (const flag of q.flags) {
    if (flag === "pending" && !doc.pending) return false;
    if (flag === "template" && !doc.template) return false;
    if (flag === "archived" && !doc.archived) return false;
  }
  for (const text of q.categoryText) {
    if (!doc.categoryHay.includes(text)) return false;
  }
  for (const text of q.containerText) {
    if (!doc.containerHay.includes(text)) return false;
  }
  return true;
}

/**
 * A doc's score, or null if it does not match.
 *
 * Every word must land somewhere — typing more narrows, as the filter rail does
 * — and the score is the AVERAGE of how well each landed, so a two-word query
 * stays comparable with a one-word one.
 */
export function scoreDoc(doc: SearchDoc, q: SearchQuery): number | null {
  if (!passes(doc, q)) return null;
  let total = 0;
  for (const word of q.words) {
    const t = tier(doc, word);
    if (t === 0) return null;
    total += t;
  }
  const quality = q.words.length === 0 ? 0 : total / q.words.length;
  return quality + KIND_BASE[doc.kind] - (doc.archived ? ARCHIVED_PENALTY : 0);
}

/**
 * The total order over results — the same four-key chain `usage-ranking.ts`
 * sorts by, so equals never depend on which device built the list.
 */
export function compareResults(a: SearchResult, b: SearchResult): number {
  if (a.score !== b.score) return b.score - a.score;
  if (a.doc.recency !== b.doc.recency) return a.doc.recency < b.doc.recency ? 1 : -1;
  const title = a.doc.title.localeCompare(b.doc.title);
  if (title !== 0) return title;
  return a.doc.id.localeCompare(b.doc.id);
}

/** Insert into a list held at `cap`, dropping the worst. `cap` is single digits. */
function insertBounded(list: SearchResult[], next: SearchResult, cap: number): void {
  if (list.length >= cap && compareResults(next, list[list.length - 1]) >= 0) return;
  let i = list.length;
  while (i > 0 && compareResults(next, list[i - 1]) < 0) i -= 1;
  list.splice(i, 0, next);
  if (list.length > cap) list.pop();
}

export interface SearchOptions {
  /** How many results in total. */
  limit?: number;
  /** How many of any one kind — so a flood of entries cannot bury the one goal. */
  perKind?: number;
}

/**
 * Search the index.
 *
 * One pass over the docs, holding a bounded list PER KIND rather than scoring
 * everything and sorting it. Only those few dozen survivors are ever sorted, so
 * the cost does not grow with how many entries happen to match — which is the
 * difference between a palette that stays sharp at ten thousand rows and one
 * that sorts four thousand of them between two keystrokes.
 *
 * An empty box is not "nothing": it ranks by kind, which puts the screens first
 * and the newest entries under them — the default list worth showing.
 */
export function search(
  index: SearchIndex,
  raw: string,
  opts: SearchOptions = {},
): SearchResult[] {
  return run(index.docs, parseQuery(raw), opts);
}

/**
 * The one pass both the stateless search and the session share. `keep`, when
 * given, collects every match — the session's candidate set for the next
 * keystroke.
 */
function run(
  docs: readonly SearchDoc[],
  q: SearchQuery,
  opts: SearchOptions,
  keep?: SearchDoc[],
): SearchResult[] {
  const limit = opts.limit ?? 20;
  const perKind = opts.perKind ?? 5;
  const byKind = new Map<DocKind, SearchResult[]>();

  for (const doc of docs) {
    const score = scoreDoc(doc, q);
    if (score === null) continue;
    keep?.push(doc);
    let bucket = byKind.get(doc.kind);
    if (!bucket) {
      bucket = [];
      byKind.set(doc.kind, bucket);
    }
    insertBounded(bucket, { doc, score }, perKind);
  }

  const merged: SearchResult[] = [];
  for (const bucket of byKind.values()) merged.push(...bucket);
  return merged.sort(compareResults).slice(0, Math.max(0, limit));
}

// ── typing ─────────────────────────────────────────────────────────────────

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Every constraint identical — only then can the words alone decide narrowing. */
function sameConstraints(a: SearchQuery, b: SearchQuery): boolean {
  return (
    a.min === b.min &&
    a.max === b.max &&
    a.exact === b.exact &&
    (a.range?.start ?? null) === (b.range?.start ?? null) &&
    (a.range?.end ?? null) === (b.range?.end ?? null) &&
    sameList(a.kinds, b.kinds) &&
    sameList(a.flags, b.flags) &&
    sameList(a.categoryText, b.categoryText) &&
    sameList(a.containerText, b.containerText)
  );
}

/**
 * Can `next` only ever match a subset of what `prev` matched?
 *
 * True when the constraints are unchanged and the words only grew: earlier words
 * identical, the last one extended, and any further words are pure extra
 * narrowing. A longer word is strictly harder to find than the prefix it starts
 * with, so nothing that matches `next` can have failed `prev` — which is what
 * makes it safe to rescan the survivors instead of the ledger.
 *
 * Deliberately conservative. Deleting a character, or editing a token into a
 * constraint (`2026-0` is a word, `2026-07` is a month), fails this and costs a
 * full pass — the correct trade, since a wrong "yes" here silently loses rows.
 */
export function narrows(prev: SearchQuery, next: SearchQuery): boolean {
  if (!sameConstraints(prev, next)) return false;
  if (next.words.length < prev.words.length) return false;
  const last = prev.words.length - 1;
  for (let i = 0; i < last; i += 1) {
    if (next.words[i] !== prev.words[i]) return false;
  }
  return last < 0 || next.words[last].startsWith(prev.words[last]);
}

export interface SearchSession {
  search(raw: string, opts?: SearchOptions): SearchResult[];
  /** How many docs the last search actually looked at. The perf contract. */
  readonly scanned: number;
}

/**
 * A search that remembers what it just found.
 *
 * Typing is the common case, and each keystroke can only shrink the answer. So
 * the session keeps the docs that survived the last query and, when the new one
 * provably narrows, scans only those: the first character pays for the ledger,
 * every character after it pays for what is left. Identical output to a cold
 * `search` — that equivalence is the test, not the intention.
 */
export function createSession(index: SearchIndex): SearchSession {
  let prev: SearchQuery | null = null;
  let survivors: SearchDoc[] = [];
  let scanned = 0;

  return {
    get scanned() {
      return scanned;
    },
    search(raw: string, opts: SearchOptions = {}): SearchResult[] {
      const q = parseQuery(raw);
      const source = prev !== null && narrows(prev, q) ? survivors : index.docs;
      scanned = source.length;
      const keep: SearchDoc[] = [];
      const results = run(source, q, opts, keep);
      prev = q;
      survivors = keep;
      return results;
    },
  };
}

/**
 * Where each word landed in a string, merged and in order — what the palette
 * underlines. Overlapping hits become one run so a highlight never nests.
 */
export function matchRanges(text: string, words: readonly string[]): [number, number][] {
  if (words.length === 0 || text === "") return [];
  const hay = text.toLowerCase();
  const hits: [number, number][] = [];
  for (const word of words) {
    if (word === "") continue;
    let i = hay.indexOf(word);
    while (i !== -1) {
      hits.push([i, i + word.length]);
      i = hay.indexOf(word, i + 1);
    }
  }
  if (hits.length === 0) return [];
  hits.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: [number, number][] = [hits[0]];
  for (const [start, end] of hits.slice(1)) {
    const last = merged[merged.length - 1];
    // Touching is not overlapping: "co" twice in "cocoa" is two hits, not one.
    if (start < last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}
