import { subMonths, format } from "date-fns";

/**
 * The unified reporting-period control (§6.1). One global window drives every
 * dashboard widget; two-range compare (§6.2) is just two of these resolved
 * independently. Per-widget override is deferred to M11.
 */
export type PeriodPreset =
  "last-month" | "last-3-months" | "last-6-months" | "last-12-months" | "ytd" | "all";

export type ReportingPeriod =
  | { kind: "preset"; preset: PeriodPreset }
  | { kind: "custom"; start: string; end: string };

/** A resolved window. `null` on a side = unbounded (used by the "all" preset). */
export interface DateRange {
  start: string | null;
  end: string | null;
}

const MONTHS_BACK: Record<Exclude<PeriodPreset, "ytd" | "all">, number> = {
  "last-month": 1,
  "last-3-months": 3,
  "last-6-months": 6,
  "last-12-months": 12,
};

/** Parse an ISO calendar date at local midnight (dates are calendar days, §1). */
function parseDay(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

/**
 * Resolve a period to a concrete `DateRange`, rolling from `today` (locked M5):
 * every "last-N-months" preset is `today − N months … today` inclusive; YTD is
 * Jan 1 of `today`'s year … today; "all" is unbounded. `today` is passed in so
 * this stays pure/deterministic — no `Date.now()` in `core`.
 */
export function resolvePeriod(period: ReportingPeriod, today: string): DateRange {
  if (period.kind === "custom") {
    return { start: period.start, end: period.end };
  }
  if (period.preset === "all") return { start: null, end: null };
  if (period.preset === "ytd") {
    return { start: `${today.slice(0, 4)}-01-01`, end: today };
  }
  const start = format(
    subMonths(parseDay(today), MONTHS_BACK[period.preset]),
    "yyyy-MM-dd",
  );
  return { start, end: today };
}

/** Inclusive membership; a `null` bound is open on that side. ISO strings sort. */
export function inRange(date: string, range: DateRange): boolean {
  if (range.start !== null && date < range.start) return false;
  if (range.end !== null && date > range.end) return false;
  return true;
}

/** The yearMonth key ("2026-07") of an ISO date. */
function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

/** Step from one "YYYY-MM" key to the next. */
function nextMonthKey(key: string): string {
  let [y, m] = key.split("-").map(Number);
  m += 1;
  if (m > 12) {
    m = 1;
    y += 1;
  }
  return `${y}-${String(m).padStart(2, "0")}`;
}

/**
 * Every yearMonth key the range touches, inclusive and ascending. When the range
 * is unbounded (the "all" preset), bounds are derived from `fallbackDates` — the
 * dataset's own dates — so a monthly axis still spans exactly the logged data.
 */
export function monthKeysInRange(range: DateRange, fallbackDates: string[]): string[] {
  let startKey = range.start !== null ? monthKey(range.start) : null;
  let endKey = range.end !== null ? monthKey(range.end) : null;

  if (startKey === null || endKey === null) {
    if (fallbackDates.length === 0) return [];
    const keys = fallbackDates.map(monthKey).sort();
    startKey ??= keys[0];
    endKey ??= keys[keys.length - 1];
  }
  if (startKey > endKey) return [];

  const out: string[] = [];
  for (let k = startKey; k <= endKey; k = nextMonthKey(k)) out.push(k);
  return out;
}

/**
 * Divisor for period-monthly-average metrics (§6.3/§6.5): the count of month keys
 * the window touches, so the average matches the per-month bars the user sees.
 * Never 0 — a same-month range still averages over one month.
 */
export function monthsInRange(range: DateRange, fallbackDates: string[]): number {
  return Math.max(1, monthKeysInRange(range, fallbackDates).length);
}
