/**
 * The app's clock. `src/core` is deliberately clock-free (every engine function
 * takes `today` as an argument), so reading the wall clock happens here, once.
 *
 * These are LOCAL-calendar helpers, not UTC ones. `new Date().toISOString()`
 * yields the UTC day: east of Greenwich that can be tomorrow all evening, west of
 * it yesterday all morning. Either way a transaction the user logs "today" gets
 * filed under the wrong date, lands under the wrong day header, and drops into the
 * wrong reporting month at a month boundary. A ledger date is a calendar day in
 * the user's own life (§5.4), so it must come from their local calendar.
 */

/** Local calendar day of `d` as `YYYY-MM-DD`. */
export function toIsoDate(d: Date): string {
  const y = String(d.getFullYear()).padStart(4, "0");
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Today, on the user's calendar. */
export function todayIso(now: Date = new Date()): string {
  return toIsoDate(now);
}

/** Yesterday, on the user's calendar. Built from calendar fields rather than
 * `now - 86400000` so the 23- and 25-hour days at a DST switch still resolve. */
export function yesterdayIso(now: Date = new Date()): string {
  return toIsoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
}

/** This month as `YYYY-MM` — the stored `yearMonth` key's local counterpart (§8.3). */
export function thisMonthIso(now: Date = new Date()): string {
  return todayIso(now).slice(0, 7);
}

const TIME_FORMAT = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

/**
 * A row's `entered_at` instant as a local clock time ("2:04 PM") — what
 * distinguishes three entries logged the same afternoon. Null for rows written
 * before M11, which carry no instant; callers render nothing rather than a guess.
 */
export function formatEnteredTime(enteredAt: string | null | undefined): string | null {
  if (!enteredAt) return null;
  const d = new Date(enteredAt);
  return Number.isNaN(d.getTime()) ? null : TIME_FORMAT.format(d);
}

const DATE_TIME_FORMAT = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** The full "when this was written" stamp, for a detail view. */
export function formatEnteredAt(enteredAt: string | null | undefined): string | null {
  if (!enteredAt) return null;
  const d = new Date(enteredAt);
  return Number.isNaN(d.getTime()) ? null : DATE_TIME_FORMAT.format(d);
}
