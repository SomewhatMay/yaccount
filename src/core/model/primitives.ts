import { z } from "zod";

/** All PKs are UUID strings (§5). Needs a secure context in the browser (§1). */
export const newId = (): string => crypto.randomUUID();

/**
 * Integer count of cents. The ONLY on-disk / on-the-wire money representation
 * (§1, locked M1). Decimal appears solely at the input/display edges in money.ts.
 * Kept as a plain `number` alias (not a nominal brand) for ergonomics; integrity
 * is guarded by zod `.int()` at every table edge and by the money.ts funnel.
 */
export type Cents = number;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const YEAR_MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * A real calendar day, not just the right shape. "2026-13-45" and "2026-02-30"
 * used to pass, and their derived `yearMonth` ("2026-13") becomes an index
 * bucket (§8.3) no report will ever query — the row silently disappears from
 * every month-scoped view.
 */
export function isCalendarDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate(); // day 0 of next month
}

/** UUID / well-known string id. */
export const zId = z.string().min(1);
/** ISO calendar date `YYYY-MM-DD` (treated as a calendar date, not an instant — §1). */
export const zIsoDate = z
  .string()
  .refine(isCalendarDate, "expected a real calendar date YYYY-MM-DD");
/** Stored `yearMonth` key, e.g. "2026-07" (§8.3). */
export const zYearMonth = z.string().regex(YEAR_MONTH_RE, "expected YYYY-MM");
/** Signed integer cents. */
export const zCents = z.number().int().safe();
/** Non-negative integer cents (for amounts constrained `>= 0`). */
export const zCentsNonNeg = z.number().int().safe().min(0);
/** A name the user typed: stored trimmed, never blank (§5.1/§5.2 UNIQUE). */
export const zName = z.string().trim().min(1);

/** Derive the stored `yearMonth` index key from an ISO calendar date (§8.3). */
export function yearMonthOf(isoDate: string): string {
  if (!isCalendarDate(isoDate)) throw new Error(`invalid ISO date: ${isoDate}`);
  return isoDate.slice(0, 7);
}
