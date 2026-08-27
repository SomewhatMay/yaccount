import { addYears, format, subDays } from "date-fns";
import { isTransferRule, type Category, type RecurringRule } from "../model";
import { upcomingOccurrences } from "./recurring";

export type CommitmentMode = "regular" | "irregular";

export interface CommitmentOccurrence {
  ruleId: string;
  label: string;
  categoryId: string;
  categoryName: string;
  date: string;
  amount: number | null;
}

export interface CommitmentRule {
  ruleId: string;
  label: string;
  categoryId: string;
  categoryName: string;
  amount: number | null;
  occurrenceCount: number;
  monthlyEquivalent: number | null;
  nextOccurrence: string;
  occurrences: CommitmentOccurrence[];
}

export interface CommitmentGroup {
  categoryId: string;
  categoryName: string;
  monthlyEquivalent: number;
  rules: CommitmentRule[];
}

export interface CommitmentMonth {
  month: string;
  total: number;
  occurrenceCount: number;
}

export interface CommitmentSection {
  rules: CommitmentRule[];
  occurrences: CommitmentOccurrence[];
  knownNext12Months: number;
  monthlyEquivalent: number;
  unknownAmountCount: number;
  nextOccurrence: CommitmentOccurrence | null;
}

export interface Commitments {
  start: string;
  end: string;
  activeExpenseRuleCount: number;
  regular: CommitmentSection & { groups: CommitmentGroup[] };
  irregular: CommitmentSection & { months: CommitmentMonth[] };
}

const AVERAGE_GREGORIAN_MONTH_DAYS_NUMERATOR = 146_097;
const AVERAGE_GREGORIAN_MONTH_DAYS_DENOMINATOR = 4_800;

/** Automatic D10 split. Integer comparison avoids floating cadence boundaries. */
export function commitmentMode(rule: RecurringRule): CommitmentMode {
  if (rule.frequency === "annually") return "irregular";
  if (rule.frequency !== "custom") return "regular";

  const config = rule.interval_config;
  if (config.unit === "month") return config.every <= 1 ? "regular" : "irregular";
  if (config.unit === "year") return "irregular";
  const days = config.every * (config.unit === "week" ? 7 : 1);
  return days * AVERAGE_GREGORIAN_MONTH_DAYS_DENOMINATOR <=
    AVERAGE_GREGORIAN_MONTH_DAYS_NUMERATOR
    ? "regular"
    : "irregular";
}

function shiftMonth(yearMonth: string, delta: number): string {
  const [year, month] = yearMonth.split("-").map(Number);
  const shifted = year * 12 + month - 1 + delta;
  return `${Math.floor(shifted / 12)}-${String((shifted % 12) + 1).padStart(2, "0")}`;
}

function monthKeys(start: string, end: string): string[] {
  const first = start.slice(0, 7);
  const last = end.slice(0, 7);
  const keys: string[] = [];
  for (let index = 0; index < 14; index += 1) {
    const month = shiftMonth(first, index);
    keys.push(month);
    if (month === last) break;
  }
  return keys;
}

function compareRules(a: CommitmentRule, b: CommitmentRule): number {
  return (
    a.categoryName.localeCompare(b.categoryName) ||
    a.nextOccurrence.localeCompare(b.nextOccurrence) ||
    a.label.localeCompare(b.label) ||
    a.ruleId.localeCompare(b.ruleId)
  );
}

function section(rules: CommitmentRule[]): CommitmentSection {
  const occurrences = rules
    .flatMap((rule) => rule.occurrences)
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.label.localeCompare(b.label) ||
        a.ruleId.localeCompare(b.ruleId),
    );
  const knownNext12Months = occurrences.reduce(
    (total, occurrence) => total + (occurrence.amount ?? 0),
    0,
  );
  return {
    rules,
    occurrences,
    knownNext12Months,
    monthlyEquivalent: Math.round(knownNext12Months / 12),
    unknownAmountCount: rules.filter((rule) => rule.amount === null).length,
    nextOccurrence: occurrences[0] ?? null,
  };
}

function grouped(rules: CommitmentRule[], monthlyEquivalent: number): CommitmentGroup[] {
  const groups = new Map<
    string,
    { categoryId: string; categoryName: string; annual: number; rules: CommitmentRule[] }
  >();
  for (const rule of rules) {
    const group = groups.get(rule.categoryId) ?? {
      categoryId: rule.categoryId,
      categoryName: rule.categoryName,
      annual: 0,
      rules: [],
    };
    group.annual += rule.occurrences.reduce(
      (total, occurrence) => total + (occurrence.amount ?? 0),
      0,
    );
    group.rules.push(rule);
    groups.set(rule.categoryId, group);
  }

  const ordered = [...groups.values()].sort(
    (a, b) =>
      a.categoryName.localeCompare(b.categoryName) ||
      a.categoryId.localeCompare(b.categoryId),
  );
  const allocated = ordered.map((group) => ({
    ...group,
    monthlyEquivalent: Math.floor(group.annual / 12),
    remainder: group.annual % 12,
  }));
  let centsLeft =
    monthlyEquivalent -
    allocated.reduce((total, group) => total + group.monthlyEquivalent, 0);
  for (const group of [...allocated].sort(
    (a, b) =>
      b.remainder - a.remainder ||
      a.categoryName.localeCompare(b.categoryName) ||
      a.categoryId.localeCompare(b.categoryId),
  )) {
    if (centsLeft <= 0) break;
    group.monthlyEquivalent += 1;
    centsLeft -= 1;
  }
  return allocated.map(({ remainder: _remainder, annual: _annual, ...group }) => group);
}

/** Structural expense burden over today through the day before next year's date. */
export function commitments(input: {
  today: string;
  categories: Category[];
  recurringRules: RecurringRule[];
}): Commitments {
  const end = format(
    subDays(addYears(new Date(`${input.today}T00:00:00`), 1), 1),
    "yyyy-MM-dd",
  );
  const expenseCategories = new Map(
    input.categories
      .filter((category) => category.type === "expense" && !category.is_archived)
      .map((category) => [category.id, category.name]),
  );
  const eligible = input.recurringRules.filter(
    (rule) =>
      rule.status === "active" &&
      !isTransferRule(rule) &&
      rule.template_category_id !== null &&
      expenseCategories.has(rule.template_category_id),
  );
  const occurrences = upcomingOccurrences(eligible, input.today, end, {
    limit: Number.MAX_SAFE_INTEGER,
  });
  const byRule = new Map<string, typeof occurrences>();
  for (const occurrence of occurrences) {
    const rows = byRule.get(occurrence.rule.id) ?? [];
    rows.push(occurrence);
    byRule.set(occurrence.rule.id, rows);
  }
  const rules = eligible.flatMap((rule): CommitmentRule[] => {
    const scheduled = byRule.get(rule.id) ?? [];
    if (scheduled.length === 0 || rule.template_category_id === null) return [];
    const amount = rule.template_amount === null ? null : Math.abs(rule.template_amount);
    const categoryName = expenseCategories.get(rule.template_category_id)!;
    const normalizedOccurrences = scheduled.map((occurrence): CommitmentOccurrence => ({
      ruleId: rule.id,
      label: rule.template_vendor_source,
      categoryId: rule.template_category_id!,
      categoryName,
      date: occurrence.date,
      amount,
    }));
    const total = normalizedOccurrences.reduce(
      (sum, occurrence) => sum + (occurrence.amount ?? 0),
      0,
    );
    return [
      {
        ruleId: rule.id,
        label: rule.template_vendor_source,
        categoryId: rule.template_category_id,
        categoryName,
        amount,
        occurrenceCount: normalizedOccurrences.length,
        monthlyEquivalent: amount === null ? null : Math.round(total / 12),
        nextOccurrence: normalizedOccurrences[0].date,
        occurrences: normalizedOccurrences,
      },
    ];
  });
  const regularRules = rules
    .filter((rule) => {
      const source = input.recurringRules.find((item) => item.id === rule.ruleId)!;
      return commitmentMode(source) === "regular";
    })
    .sort(compareRules);
  const irregularRules = rules
    .filter((rule) => {
      const source = input.recurringRules.find((item) => item.id === rule.ruleId)!;
      return commitmentMode(source) === "irregular";
    })
    .sort(compareRules);
  const regular = section(regularRules);
  const irregular = section(irregularRules);
  const irregularByMonth = new Map<string, { total: number; count: number }>();
  for (const occurrence of irregular.occurrences) {
    const month = occurrence.date.slice(0, 7);
    const value = irregularByMonth.get(month) ?? { total: 0, count: 0 };
    value.total += occurrence.amount ?? 0;
    value.count += 1;
    irregularByMonth.set(month, value);
  }

  return {
    start: input.today,
    end,
    activeExpenseRuleCount: rules.length,
    regular: {
      ...regular,
      groups: grouped(regularRules, regular.monthlyEquivalent),
    },
    irregular: {
      ...irregular,
      months: monthKeys(input.today, end).map((month) => ({
        month,
        total: irregularByMonth.get(month)?.total ?? 0,
        occurrenceCount: irregularByMonth.get(month)?.count ?? 0,
      })),
    },
  };
}
