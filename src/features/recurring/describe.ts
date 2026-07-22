import type {
  AnnuallyConfig,
  BiweeklyConfig,
  CustomConfig,
  MonthlyConfig,
  RecurringRule,
  WeeklyConfig,
} from "@/core/model";

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** The ordinal suffix for a day of the month (1st, 2nd, 3rd, 4th…). */
export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

/** A plain-language summary of a rule's cadence (§5.8), for the register rows. */
export function describeRule(rule: RecurringRule): string {
  switch (rule.frequency) {
    case "daily":
      return "Every day";
    case "weekly":
      return `Weekly on ${WEEKDAYS[(rule.interval_config as WeeklyConfig).day_of_week]}`;
    case "biweekly": {
      const [a, b] = (rule.interval_config as BiweeklyConfig).days_of_month;
      return `Twice a month · ${ordinal(a)} & ${ordinal(b)}`;
    }
    case "monthly":
      return `Monthly on the ${ordinal((rule.interval_config as MonthlyConfig).day_of_month)}`;
    case "annually": {
      const cfg = rule.interval_config as AnnuallyConfig;
      return `Every year on ${MONTHS[cfg.month - 1]} ${cfg.day}`;
    }
    case "custom": {
      const { every, unit } = rule.interval_config as CustomConfig;
      return every === 1 ? `Every ${unit}` : `Every ${every} ${unit}s`;
    }
  }
}
