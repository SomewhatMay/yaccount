import { constrains, matchesWords, terms } from "@/core/engine/filter";
import {
  isTransferRule,
  type Frequency,
  type RecurringRule,
  type RuleStatus,
} from "@/core/model";

/**
 * The recurring list, narrowed and ordered. A rule is not a transaction — it is
 * a promise to write one — so it carries its own predicate, borrowing only the
 * shared meaning of "typing narrows" and "an emptied facet means all".
 */

/** What a rule will generate (§5.4's three shapes). */
export type RuleKind = "expense" | "income" | "transfer";

/**
 * A destination and no category is a transfer; otherwise the sign decides —
 * the SAME test the row colours by. A filter that disagreed with the screen
 * would hide a row rendered in emerald under "Income".
 */
export function ruleKind(rule: RecurringRule): RuleKind {
  if (isTransferRule(rule)) return "transfer";
  return (rule.template_amount ?? 0) >= 0 ? "income" : "expense";
}

export interface RuleFilter {
  text?: string;
  statuses?: RuleStatus[];
  frequencies?: Frequency[];
  kinds?: RuleKind[];
}

export interface RuleContext {
  /** Extra searchable text — the category and wallet a rule writes through. */
  label?: (rule: RecurringRule) => string;
}

export function matchesRule(
  rule: RecurringRule,
  filter: RuleFilter,
  ctx: RuleContext = {},
): boolean {
  const words = terms(filter.text);
  if (!matchesWords(`${rule.template_vendor_source} ${ctx.label?.(rule) ?? ""}`, words))
    return false;
  if (constrains(filter.statuses) && !filter.statuses.includes(rule.status)) return false;
  if (constrains(filter.frequencies) && !filter.frequencies.includes(rule.frequency))
    return false;
  if (constrains(filter.kinds) && !filter.kinds.includes(ruleKind(rule))) return false;
  return true;
}

export function applyRuleFilter(
  rules: RecurringRule[],
  filter: RuleFilter,
  ctx: RuleContext = {},
): RecurringRule[] {
  return rules.filter((r) => matchesRule(r, filter, ctx));
}

export function activeRuleFilterCount(filter: RuleFilter): number {
  let n = 0;
  if (terms(filter.text).length > 0) n += 1;
  if (constrains(filter.statuses)) n += 1;
  if (constrains(filter.frequencies)) n += 1;
  if (constrains(filter.kinds)) n += 1;
  return n;
}

export const RULE_SORTS = ["next", "name", "amount"] as const;
export type RuleSort = (typeof RULE_SORTS)[number];

/** Whether a stored preference is one this build still knows how to render. */
export function isRuleSort(value: string): value is RuleSort {
  return (RULE_SORTS as readonly string[]).includes(value);
}

export interface RuleSortContext {
  label: (rule: RecurringRule) => string;
}

/**
 * Rules in the order the reader asked for. Returns a new array.
 *
 * `amount` ranks by SIZE, not by sign — the same call `sortRegister` makes: a
 * paycheck is as big a commitment as the rent it pays, and filing every expense
 * below every income would answer a question nobody asked. Ties fall back to the
 * name and then the id so two devices agree (§8.5).
 */
export function sortRules(
  rules: RecurringRule[],
  order: RuleSort,
  ctx: RuleSortContext,
): RecurringRule[] {
  const byName = (a: RecurringRule, b: RecurringRule) =>
    ctx.label(a).localeCompare(ctx.label(b)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

  return [...rules].sort((a, b) => {
    if (order === "next") {
      if (a.next_generation_date !== b.next_generation_date)
        return a.next_generation_date < b.next_generation_date ? -1 : 1;
      return byName(a, b);
    }
    if (order === "amount") {
      const size = Math.abs(b.template_amount ?? 0) - Math.abs(a.template_amount ?? 0);
      return size !== 0 ? size : byName(a, b);
    }
    return byName(a, b);
  });
}
