import type { Transaction } from "../model";
import { isTransfer } from "./balances";
import { inRange, type DateRange } from "./period";

/**
 * ONE predicate over the ledger, shared by every list view and its tests.
 *
 * The alternative — each screen growing its own matcher — is how a search box
 * ends up finding a row the filter rail beside it hides. So the rule lives here
 * once: the register, the ⌘K palette and the other list views (M11 phase 6) all
 * narrow rows through `matchesFilter`.
 *
 * Pure and clock-free like the rest of the engine: a date window arrives as a
 * resolved `DateRange` (§6.1), never as "the last 30 days".
 */

/** What a row IS (§5.4) — the shape decides, not the label on it. */
export type TransactionKind = "expense" | "income" | "transfer";

export interface TransactionFilter {
  /** Free text over the payee, plus whatever else the caller can name a row by. */
  text?: string;
  categoryIds?: string[];
  /** Matches EITHER leg of a transfer (source or destination). */
  containerIds?: string[];
  kinds?: TransactionKind[];
  range?: DateRange;
  /** Inclusive bounds on the SIZE of an entry, in cents. */
  minAmount?: number | null;
  maxAmount?: number | null;
}

export interface FilterContext {
  /** Extra searchable text for a row — its category name, its wallet. The engine
   *  keeps no lookup tables, so the view that has them passes them in. */
  label?: (t: Transaction) => string;
}

/**
 * A transfer is category-less with a destination; otherwise the sign decides.
 * `amount >= 0` is income — the same rule the register colours by, so a filter
 * can never disagree with what is on the screen.
 */
export function transactionKind(t: Transaction): TransactionKind {
  if (isTransfer(t)) return "transfer";
  return t.amount < 0 ? "expense" : "income";
}

/** Words to match, or none — an empty box is not a constraint. */
function terms(text: string | undefined): string[] {
  return (text ?? "").toLowerCase().split(/\s+/).filter(Boolean);
}

/** A facet with nothing chosen means "all", not "none" — the UI clears one by
 *  emptying it, and an empty list must not empty the screen. */
function constrains(values: string[] | undefined): values is string[] {
  return Array.isArray(values) && values.length > 0;
}

function boundedRange(range: DateRange | undefined): range is DateRange {
  return range !== undefined && (range.start !== null || range.end !== null);
}

/**
 * Every word must match, in any order, ignoring case: typing more narrows rather
 * than widens, which is how a person expects a search box to behave.
 */
export function matchesText(
  t: Transaction,
  words: string[],
  label?: (t: Transaction) => string,
): boolean {
  if (words.length === 0) return true;
  const hay = `${t.vendor_source} ${label?.(t) ?? ""}`.toLowerCase();
  return words.every((word) => hay.includes(word));
}

export function matchesFilter(
  t: Transaction,
  filter: TransactionFilter,
  ctx: FilterContext = {},
): boolean {
  if (!matchesText(t, terms(filter.text), ctx.label)) return false;
  if (constrains(filter.categoryIds)) {
    if (t.category_id === null || !filter.categoryIds.includes(t.category_id))
      return false;
  }
  if (constrains(filter.containerIds)) {
    const here =
      filter.containerIds.includes(t.container_id) ||
      (t.to_container_id !== null && filter.containerIds.includes(t.to_container_id));
    if (!here) return false;
  }
  if (constrains(filter.kinds) && !filter.kinds.includes(transactionKind(t)))
    return false;
  if (boundedRange(filter.range) && !inRange(t.date, filter.range)) return false;
  // Size, not direction: "anything over $100" is a question about how big the
  // entry is, and a paycheck is as big as the rent it pays.
  const size = Math.abs(t.amount);
  if (filter.minAmount != null && size < filter.minAmount) return false;
  if (filter.maxAmount != null && size > filter.maxAmount) return false;
  return true;
}

/** The filter applied. Order is the caller's — sorting is a separate decision. */
export function applyFilter(
  txns: Transaction[],
  filter: TransactionFilter,
  ctx: FilterContext = {},
): Transaction[] {
  return txns.filter((t) => matchesFilter(t, filter, ctx));
}

/**
 * How many facets are narrowing the list — the number the rail reports. Facets,
 * not values: "2 filters" means two questions being asked, and a range counts
 * once however many of its sides are set.
 */
export function activeFilterCount(filter: TransactionFilter): number {
  let n = 0;
  if (terms(filter.text).length > 0) n += 1;
  if (constrains(filter.categoryIds)) n += 1;
  if (constrains(filter.containerIds)) n += 1;
  if (constrains(filter.kinds)) n += 1;
  if (boundedRange(filter.range)) n += 1;
  if (filter.minAmount != null || filter.maxAmount != null) n += 1;
  return n;
}

/** Whether anything is being narrowed — what the carried day-header balance
 *  hides on (§12.4 M11: a filtered list's rows no longer explain the number). */
export function isFilterActive(filter: TransactionFilter): boolean {
  return activeFilterCount(filter) > 0;
}
