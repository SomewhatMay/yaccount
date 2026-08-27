import { addDays, addMonths, addYears, format, getDay } from "date-fns";
import {
  isTransferRule,
  makeTransaction,
  makeTransfer,
  type BiweeklyConfig,
  type CustomConfig,
  type RecurringRule,
  type Transaction,
  type WeeklyConfig,
  type AnnuallyConfig,
  type MonthlyConfig,
} from "../model";

/**
 * Recurring generation (§5.8). All occurrence math is pure and clock-free —
 * `today` is passed in — so the engine stays testable in `core` (§0.7). Dates are
 * ISO calendar days (`YYYY-MM-DD`), compared as strings (they sort correctly).
 */

type ISO = string;

function parseDay(iso: ISO): Date {
  return new Date(`${iso}T00:00:00`);
}
function fmt(d: Date): ISO {
  return format(d, "yyyy-MM-dd");
}

/** Days in a given month (1-based month), honoring leap years. */
function daysInMonth(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

/** An anchor day clamped to a real day of the target month (e.g. 31 → Feb 28). */
function clampedDay(year: number, month1to12: number, day: number): ISO {
  const d = Math.min(day, daysInMonth(year, month1to12));
  return `${year}-${String(month1to12).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function ymd(iso: ISO): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

/** The month-anchored occurrence for a monthly rule in a given (year, month). */
function monthlyOcc(cfg: MonthlyConfig, year: number, month1to12: number): ISO {
  return clampedDay(year, month1to12, cfg.day_of_month);
}

/** The two twice-a-month anchors for a biweekly rule in a given (year, month). */
function biweeklyOccs(cfg: BiweeklyConfig, year: number, month1to12: number): [ISO, ISO] {
  const [a, b] = cfg.days_of_month;
  return [clampedDay(year, month1to12, a), clampedDay(year, month1to12, b)];
}

/** Advance a (year, month) pair by one month, wrapping the year. */
function nextMonth(year: number, month1to12: number): { year: number; month: number } {
  return month1to12 === 12
    ? { year: year + 1, month: 1 }
    : { year, month: month1to12 + 1 };
}

/**
 * The first occurrence date on or after `from`. The generation cursor
 * (`next_generation_date`) is only a lower bound — this snaps it onto the true
 * grid, so a start date that isn't itself an occurrence still generates right.
 */
export function firstOccurrenceOnOrAfter(rule: RecurringRule, from: ISO): ISO {
  switch (rule.frequency) {
    case "daily":
      return from;
    case "weekly": {
      const want = (rule.interval_config as WeeklyConfig).day_of_week;
      let d = parseDay(from);
      // getDay: 0=Sun … 6=Sat — matches day_of_week.
      const delta = (want - getDay(d) + 7) % 7;
      d = addDays(d, delta);
      return fmt(d);
    }
    case "monthly": {
      const cfg = rule.interval_config as MonthlyConfig;
      let { y, m } = ymd(from);
      let occ = monthlyOcc(cfg, y, m);
      if (occ < from)
        (({ year: y, month: m } = nextMonth(y, m)), (occ = monthlyOcc(cfg, y, m)));
      return occ;
    }
    case "biweekly": {
      const cfg = rule.interval_config as BiweeklyConfig;
      let { y, m } = ymd(from);
      for (let guard = 0; guard < 4; guard++) {
        const [a, b] = biweeklyOccs(cfg, y, m);
        if (from <= a) return a;
        if (from <= b) return b;
        ({ year: y, month: m } = nextMonth(y, m));
      }
      // Unreachable: an anchor exists every month.
      return biweeklyOccs(cfg, y, m)[0];
    }
    case "annually": {
      const cfg = rule.interval_config as AnnuallyConfig;
      let { y } = ymd(from);
      let occ = clampedDay(y, cfg.month, cfg.day);
      if (occ < from) occ = clampedDay(++y, cfg.month, cfg.day);
      return occ;
    }
    case "custom": {
      // Strict cadence anchored on start_date. Step forward until >= from.
      const cfg = rule.interval_config as CustomConfig;
      let d = parseDay(rule.start_date);
      const target = parseDay(from);
      let guard = 0;
      while (d < target && guard++ < 1_000_000) d = stepCustom(d, cfg);
      return fmt(d);
    }
  }
}

/** One custom step forward (`every` × unit) from a date, clamping month/year. */
function stepCustom(d: Date, cfg: CustomConfig): Date {
  switch (cfg.unit) {
    case "day":
      return addDays(d, cfg.every);
    case "week":
      return addDays(d, cfg.every * 7);
    case "month":
      return addMonths(d, cfg.every); // date-fns clamps (e.g. Jan 31 +1mo → Feb 28)
    case "year":
      return addYears(d, cfg.every);
  }
}

/** The next occurrence strictly after `date` (which must be on the grid). */
export function nextOccurrence(rule: RecurringRule, date: ISO): ISO {
  switch (rule.frequency) {
    case "daily":
      return fmt(addDays(parseDay(date), 1));
    case "weekly":
      return fmt(addDays(parseDay(date), 7));
    case "monthly": {
      const cfg = rule.interval_config as MonthlyConfig;
      const { y, m } = ymd(date);
      const n = nextMonth(y, m);
      return monthlyOcc(cfg, n.year, n.month);
    }
    case "biweekly": {
      const cfg = rule.interval_config as BiweeklyConfig;
      const { y, m } = ymd(date);
      const [a, b] = biweeklyOccs(cfg, y, m);
      if (date < b && date >= a) return b; // move to the later anchor same month
      const n = nextMonth(y, m); // otherwise roll to the earlier anchor next month
      return biweeklyOccs(cfg, n.year, n.month)[0];
    }
    case "annually": {
      const cfg = rule.interval_config as AnnuallyConfig;
      const { y } = ymd(date);
      return clampedDay(y + 1, cfg.month, cfg.day);
    }
    case "custom":
      return fmt(stepCustom(parseDay(date), rule.interval_config as CustomConfig));
  }
}

/** True if the rule is done recurring by `date` (past its end, or cancelled). */
function endedBy(rule: RecurringRule, date: ISO): boolean {
  return rule.status === "cancelled" || (rule.end_date !== null && date > rule.end_date);
}

/** Build one pending row for an occurrence on `date` (§5.8). Its id is derived
 * from `(rule.id, date)` so re-running generation never duplicates an occurrence
 * — the same day always yields the same row id (idempotent `put`, §8.2). */
function occurrenceRow(rule: RecurringRule, date: ISO, amount: number): Transaction {
  const id = `${rule.id}:${date}`;
  if (isTransferRule(rule)) {
    return makeTransfer({
      id,
      date,
      amount: Math.abs(amount), // transfer template stores a positive magnitude
      container_id: rule.template_container_id,
      to_container_id: rule.template_to_container_id!,
      vendor_source: rule.template_vendor_source,
      inbox_status: "pending",
      recurring_rule_id: rule.id,
      recurring_occurrence_date: date,
    });
  }
  return makeTransaction({
    id,
    date,
    amount, // expense/income template stores a signed amount
    vendor_source: rule.template_vendor_source,
    category_id: rule.template_category_id!,
    container_id: rule.template_container_id,
    inbox_status: "pending",
    recurring_rule_id: rule.id,
    recurring_occurrence_date: date,
  });
}

export interface GenerationResult {
  /** Pending rows to append (each already keyed to `(rule, date)`). */
  rows: Transaction[];
  /** The rule with its `next_generation_date` advanced past everything generated. */
  rule: RecurringRule;
}

/**
 * Generate the pending occurrences a rule owes as of `today` (§5.8, locked:
 * one row per occurrence, never a future batch). Backfill of occurrences missed
 * while the app was closed depends on `amount_mode`:
 *   - `fixed`        → every missed occurrence, oldest-first, each at its own due
 *                      date (those charges really happened, never silently skipped).
 *   - `goal_derived` → a SINGLE current occurrence at today (M7 recomputes the
 *                      self-correcting `required_monthly`; stacking per-missed-month
 *                      would double-count the deadline catch-up). Amount stubbed to
 *                      `template_amount` until M7 wires the goal derivation.
 *
 * Idempotent: occurrence rows are keyed by `(rule, date)` and the returned rule
 * carries an advanced `next_generation_date`, so re-running on the same day emits
 * nothing new even before the rule update persists.
 *
 * For a `goal_derived` rule (§5.9.5) the caller resolves the linked goal's current
 * `required_monthly` and passes it as `opts.goalDerivedAmount` — the one genuinely
 * new engine behavior the savings system adds. A resolved amount of `0` (the goal
 * is funded / done) generates nothing but still advances the cursor. When no
 * amount is supplied the rule falls back to its stored `template_amount`.
 */
export function generateDueOccurrences(
  rule: RecurringRule,
  today: ISO,
  opts?: { goalDerivedAmount?: number },
): GenerationResult {
  if (rule.status === "cancelled") return { rows: [], rule };

  // Collect every occurrence date from the (snapped) cursor through today.
  const due: ISO[] = [];
  let cursor = firstOccurrenceOnOrAfter(rule, rule.next_generation_date);
  let guard = 0;
  while (cursor <= today && !endedBy(rule, cursor) && guard++ < 10_000) {
    due.push(cursor);
    cursor = nextOccurrence(rule, cursor);
  }

  if (due.length === 0) return { rows: [], rule };

  let rows: Transaction[];
  if (rule.amount_mode === "goal_derived") {
    // One occurrence, dated today, at the current (self-corrected) ask (§5.8).
    const resolved = opts?.goalDerivedAmount ?? rule.template_amount ?? 0;
    // A funded/completed deadline goal asks $0 → stop generating (§5.9.5). Only
    // skip when the caller actually resolved the ask; a null fallback still logs.
    rows =
      opts?.goalDerivedAmount !== undefined && opts.goalDerivedAmount <= 0
        ? []
        : [occurrenceRow(rule, today, resolved)];
  } else {
    const amount = rule.template_amount ?? 0;
    rows = due.map((date) => occurrenceRow(rule, date, amount));
  }

  return { rows, rule: { ...rule, next_generation_date: cursor } };
}

export interface UpcomingOccurrence {
  rule: RecurringRule;
  date: ISO;
  /** What it will cost, when the rule knows. Null for a goal-derived rule with
   *  nothing stored — its ask is recomputed at generation time (§5.9.5), and a
   *  guess printed as a commitment would be worse than an honest blank. */
  amount: number | null;
}

/**
 * What is coming, between `from` and `to` inclusive (M11) — a read over the same
 * occurrence grid `generateDueOccurrences` walks, but it **generates nothing**.
 * Nothing here touches `next_generation_date`, so opening the dashboard can never
 * put a row in the Inbox.
 *
 * It reads the SCHEDULE, not the cursor: a rule whose occurrences have already
 * been generated still shows what it owes next, which is the question "coming up"
 * asks. A rule that has not started yet, one that has ended, and a paused one all
 * say nothing.
 *
 * Ordered by date, then payee, then rule id, so two devices list them the same
 * way (§8.5). `limit` bounds the answer — a daily rule over a long window would
 * otherwise return a wall of rows nothing has room for.
 */
export function upcomingOccurrences(
  rules: RecurringRule[],
  from: ISO,
  to: ISO,
  opts: { limit?: number } = {},
): UpcomingOccurrence[] {
  const limit = opts.limit ?? 20;
  const out: UpcomingOccurrence[] = [];

  for (const rule of rules) {
    if (rule.status === "cancelled") continue;
    // A rule can't occur before it starts — the occurrence grid itself extends
    // backwards, so the window has to be clamped or a rule starting in September
    // would report a date in July.
    const begin = from > rule.start_date ? from : rule.start_date;
    if (begin > to) continue;

    let date = firstOccurrenceOnOrAfter(rule, begin);
    for (let guard = 0; date <= to && guard < 1000; guard++) {
      if (endedBy(rule, date)) break;
      out.push({ rule, date, amount: rule.template_amount });
      date = nextOccurrence(rule, date);
    }
  }

  return out
    .sort(
      (a, b) =>
        (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) ||
        a.rule.template_vendor_source.localeCompare(b.rule.template_vendor_source) ||
        (a.rule.id < b.rule.id ? -1 : a.rule.id > b.rule.id ? 1 : 0),
    )
    .slice(0, limit);
}
