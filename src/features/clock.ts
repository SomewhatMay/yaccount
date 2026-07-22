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

/** Last month as `YYYY-MM` — the month a figure is compared against. Built from
 * the month field, not by stepping back days: from the 31st that would land in
 * the same month again (Mar 31 − 30 days is still March). */
export function lastMonthIso(now: Date = new Date()): string {
  return thisMonthIso(new Date(now.getFullYear(), now.getMonth() - 1, 1));
}

const pad = (n: number): string => String(n).padStart(2, "0");

/**
 * ── The entry's time, as an editable field ────────────────────────────────
 * `date` is the calendar day the entry is filed under; `entered_at` is the
 * instant within it. To the user those are one thing — "when did this happen" —
 * so the two move together: re-dating an entry carries its time of day onto the
 * new day, and setting a time pins it within the day already chosen.
 */

/** A stored instant as the local `HH:mm` an `<input type="time">` expects.
 * Empty when the row carries no instant, so the field simply shows blank. */
export function timeInputValue(enteredAt: string | null | undefined): string {
  if (!enteredAt) return "";
  const d = new Date(enteredAt);
  return Number.isNaN(d.getTime()) ? "" : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A picked date + time, as an instant — read in the USER's zone, since that is
 * the clock they typed against. Null when either half is missing or unparseable,
 * which is how a row with no instant stays that way rather than inventing one. */
export function instantFrom(date: string, time: string): string | null {
  if (!date || !time) return null;
  const d = new Date(`${date}T${time}`); // no offset ⇒ local, per the JS spec
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * The picked date and time, carrying the live clock's seconds.
 *
 * A time input is minute-resolution, so pinning one and then logging three
 * receipts would give all three the same instant — a tie, and the register would
 * fall back to the random-UUID order this whole field exists to replace. The
 * minute is what the user chose; the seconds are the genuine order they wrote
 * them in, which is exactly what a paper register records. Creation only — an
 * edit is deliberate and stays exact.
 */
export function instantFromNow(
  date: string,
  time: string,
  now: Date = new Date(),
): string | null {
  const base = instantFrom(date, time);
  if (base === null) return null;
  const d = new Date(base);
  d.setSeconds(now.getSeconds(), now.getMilliseconds());
  return d.toISOString();
}

/** Both halves as the single value an `<input type="datetime-local">` takes. */
export function dateTimeInputValue(
  date: string,
  enteredAt: string | null | undefined,
): string {
  if (!date) return "";
  return `${date}T${timeInputValue(enteredAt) || "00:00"}`;
}

/** Now, as a `datetime-local` value — what the compose bar starts from. */
export function nowDateTimeInput(now: Date = new Date()): string {
  return `${toIsoDate(now)}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

/** Split a `datetime-local` value back into the two things a row stores.
 * Trims any seconds a browser appends — the field is minute-resolution. */
export function splitDateTime(value: string): { date: string; time: string } {
  const [date = "", time = ""] = value.split("T");
  return { date, time: time.slice(0, 5) };
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
