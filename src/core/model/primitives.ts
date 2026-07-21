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
const YEAR_MONTH_RE = /^\d{4}-\d{2}$/;

/** UUID / well-known string id. */
export const zId = z.string().min(1);
/** ISO calendar date `YYYY-MM-DD` (treated as a calendar date, not an instant — §1). */
export const zIsoDate = z.string().regex(ISO_DATE_RE, "expected ISO date YYYY-MM-DD");
/** Stored `yearMonth` key, e.g. "2026-07" (§8.3). */
export const zYearMonth = z.string().regex(YEAR_MONTH_RE, "expected YYYY-MM");
/** Signed integer cents. */
export const zCents = z.number().int();
/** Non-negative integer cents (for amounts constrained `>= 0`). */
export const zCentsNonNeg = z.number().int().min(0);

/** Derive the stored `yearMonth` index key from an ISO calendar date (§8.3). */
export function yearMonthOf(isoDate: string): string {
  if (!ISO_DATE_RE.test(isoDate)) throw new Error(`invalid ISO date: ${isoDate}`);
  return isoDate.slice(0, 7);
}
