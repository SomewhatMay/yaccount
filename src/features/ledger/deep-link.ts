import { isCalendarDate } from "@/core/model/primitives";
import { TRANSACTION_KINDS, type TransactionKind } from "@/core/engine/filter";
import { NO_FILTER, type FilterDraft } from "@/features/filter-draft";

/**
 * The ledger as a destination you can link TO (M11).
 *
 * A number on the dashboard is a door: tapping "Groceries" in the breakdown, or a
 * heavy day on the calendar, should land you on the register showing exactly
 * those rows. That drill-down is expressed as a real `/ledger?…` URL rather than
 * transient in-memory state, so the link is shareable, survives a copy-paste, and
 * reads in the address bar — the deliberate opposite of a filter that only exists
 * while the click's memory lasts.
 *
 * This is the one seam that turns those two directions into each other:
 * `ledgerHref` builds the URL the dashboard points at, `parseLedgerQuery` reads it
 * back into the same `FilterDraft` the rail already speaks. Pure and clock-free,
 * so both halves are tested against fixed strings.
 */

export interface LedgerLink {
  categoryIds?: string[];
  containerIds?: string[];
  kinds?: TransactionKind[];
  text?: string;
  /** The widget's own window; a null bound is left off (the ledger reads it as
   *  "all", and a link that pins "all time" as two dates would be a lie). */
  range?: { start: string | null; end: string | null };
  /** One entry to scroll to and flash, carrying no filter — the register drill of
   *  "show me this exact row" (§ the ⌘K palette does the same). */
  focus?: string;
}

const KIND_SET = new Set<string>(TRANSACTION_KINDS);

/** Build the deep link. Params are appended in a fixed order so the same drill
 *  always yields the same URL (stable to eyeball, stable to test). */
export function ledgerHref(link: LedgerLink): string {
  const params = new URLSearchParams();
  const list = (values: string[] | undefined) =>
    (values ?? []).filter((v) => v !== "").join(",");

  const category = list(link.categoryIds);
  const wallet = list(link.containerIds);
  const type = list(link.kinds);
  if (category) params.set("category", category);
  if (wallet) params.set("wallet", wallet);
  if (type) params.set("type", type);
  if (link.text?.trim()) params.set("q", link.text.trim());
  if (link.range?.start) params.set("from", link.range.start);
  if (link.range?.end) params.set("to", link.range.end);
  if (link.focus) params.set("focus", link.focus);

  const query = params.toString();
  return query ? `/ledger?${query}` : "/ledger";
}

/** Split a comma list, dropping the empties a trailing or doubled comma leaves. */
function commaList(raw: string | null): string[] {
  return (raw ?? "").split(",").filter((v) => v !== "");
}

/** A date is only a filter if it is a real calendar day — a link carrying
 *  `2026-13-40` must not fold the register down to nothing with no explanation. */
function validDate(raw: string | null): string {
  return raw && isCalendarDate(raw) ? raw : "";
}

/** Read a `/ledger?…` query back into the rail's draft, plus any focus target. */
export function parseLedgerQuery(search: string): {
  draft: FilterDraft;
  focus: string | null;
} {
  const params = new URLSearchParams(search);
  const kinds = commaList(params.get("type")).filter((k): k is TransactionKind =>
    KIND_SET.has(k),
  );
  const draft: FilterDraft = {
    ...NO_FILTER,
    text: params.get("q") ?? "",
    categoryIds: commaList(params.get("category")),
    containerIds: commaList(params.get("wallet")),
    kinds,
    dates: { from: validDate(params.get("from")), to: validDate(params.get("to")) },
  };
  const focus = params.get("focus");
  return { draft, focus: focus || null };
}
