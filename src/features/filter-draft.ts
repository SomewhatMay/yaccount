import { parseDollars } from "@/core/money";
import type { TransactionFilter, TransactionKind } from "@/core/engine/filter";

/**
 * What a filter rail over the LEDGER has typed, and how it becomes the engine's
 * predicate.
 *
 * Two screens ask questions of transactions — the register and the Inbox — and
 * this is the one place their rails turn keystrokes into a `TransactionFilter`.
 * Kept apart from `FilterBar` (which owns the chrome) and from
 * `core/engine/filter` (which owns the rule): this is the seam between them, and
 * it is the only part of a rail with an edge case worth a test.
 *
 * Held as strings because a bound is typed a character at a time. "1." is not an
 * error and it is not $1 — it is not a bound yet, and the list must not empty
 * under the user's fingers.
 */
export interface FilterDraft {
  text: string;
  categoryIds: string[];
  containerIds: string[];
  kinds: TransactionKind[];
  /** Which recurring rule proposed a row — the Inbox asks this; the ledger does not. */
  ruleIds: string[];
  dates: { from: string; to: string };
  amounts: { from: string; to: string };
}

export const NO_FILTER: FilterDraft = {
  text: "",
  categoryIds: [],
  containerIds: [],
  kinds: [],
  ruleIds: [],
  dates: { from: "", to: "" },
  amounts: { from: "", to: "" },
};

/**
 * A typed amount as a magnitude, or no constraint at all. `parseDollars` throws
 * on a partial value ("1.", "$") — mid-keystroke that is not an error, so it
 * reads as "no bound yet" rather than as an error under the user's fingers. The
 * size, not the direction: the engine's bounds are on `|amount|`.
 */
export function boundCents(input: string): number | null {
  if (input.trim() === "") return null;
  try {
    return Math.abs(parseDollars(input));
  } catch {
    return null;
  }
}

export function toFilter(draft: FilterDraft): TransactionFilter {
  return {
    text: draft.text,
    categoryIds: draft.categoryIds,
    containerIds: draft.containerIds,
    kinds: draft.kinds,
    ruleIds: draft.ruleIds,
    range: { start: draft.dates.from || null, end: draft.dates.to || null },
    minAmount: boundCents(draft.amounts.from),
    maxAmount: boundCents(draft.amounts.to),
  };
}
