"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { MonthAllocationPlan, PayCycleAllocationPlan } from "@/core/engine";
import { isTransferRule, type RecurringRule } from "@/core/model";
import { formatCents } from "@/core/money";
import { Eyebrow, LeaderRow, Marginalia, Money } from "@/features/ui";
import { cn } from "@/lib/utils";
import type { WidgetContext } from "../registry";

type AllocationMode = "month" | "pay-cycle";

const monthName = new Intl.DateTimeFormat("en-US", { month: "long" });
const shortDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

function dateLabel(date: string): string {
  return shortDate.format(new Date(`${date}T00:00:00`));
}

function currentMonthName(today: string): string {
  return monthName.format(new Date(`${today.slice(0, 7)}-01T00:00:00`));
}

function manualIncome(context: WidgetContext): number {
  const key = `expected_income:${context.today.slice(0, 7)}`;
  const value = Number(
    context.syncedSettings?.find((setting) => setting.key === key)?.value ?? 0,
  );
  return Number.isSafeInteger(value) ? value : 0;
}

function incomeRules(context: WidgetContext): RecurringRule[] {
  const incomeIds = new Set(
    context.categories
      .filter((category) => category.type === "income")
      .map((category) => category.id),
  );
  return context.recurringRules
    .filter(
      (rule) =>
        rule.status === "active" &&
        !isTransferRule(rule) &&
        rule.template_category_id !== null &&
        incomeIds.has(rule.template_category_id) &&
        (rule.template_amount ?? 0) > 0,
    )
    .sort(
      (a, b) =>
        a.template_vendor_source.localeCompare(b.template_vendor_source) ||
        a.id.localeCompare(b.id),
    );
}

function anchorIds(context: WidgetContext, rules: RecurringRule[]): string[] | undefined {
  const saved = context.instanceSettings?.payCycleAnchorRuleIds;
  if (!Array.isArray(saved) || !saved.every((id) => typeof id === "string")) {
    return undefined;
  }
  const eligible = new Set(rules.map((rule) => rule.id));
  return saved.filter((id) => eligible.has(id)).sort();
}

function configuredMode(context: WidgetContext): AllocationMode {
  return context.instanceSettings?.allocationMode === "pay-cycle" ? "pay-cycle" : "month";
}

function saveMode(context: WidgetContext, mode: AllocationMode): void {
  void context.saveInstanceSettings?.({
    ...context.instanceSettings,
    allocationMode: mode,
  });
}

function ModePicker({
  context,
  mode,
  payCycleAvailable,
}: {
  context: WidgetContext;
  mode: AllocationMode;
  payCycleAvailable: boolean;
}) {
  return (
    <div className="bg-muted/50 flex rounded-full p-0.5" aria-label="Allocation mode">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label="Plan by month"
        aria-pressed={mode === "month"}
        className={cn(
          "h-7 rounded-full px-2.5 text-xs",
          mode === "month" && "bg-background shadow-xs",
        )}
        onClick={() => saveMode(context, "month")}
      >
        Month
      </Button>
      {payCycleAvailable && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Plan by pay cycle"
          aria-pressed={mode === "pay-cycle"}
          className={cn(
            "h-7 rounded-full px-2.5 text-xs",
            mode === "pay-cycle" && "bg-background shadow-xs",
          )}
          onClick={() => saveMode(context, "pay-cycle")}
        >
          Pay cycle
        </Button>
      )}
    </div>
  );
}

function AmountRow({
  label,
  amount,
  displayAmount = amount,
}: {
  label: string;
  amount: number;
  displayAmount?: number;
}) {
  return (
    <div aria-label={`${label}: ${formatCents(displayAmount)}`}>
      <LeaderRow label={label}>
        <Money cents={displayAmount} tone="quiet" />
      </LeaderRow>
    </div>
  );
}

function AllocationTotal({
  label,
  amount,
  over,
}: {
  label: string;
  amount: number;
  over: boolean;
}) {
  const aria = over
    ? `Plan exceeds income by ${formatCents(Math.abs(amount))}`
    : `${label}: ${formatCents(amount)}`;
  return (
    <div
      aria-label={aria}
      className="rule-double mt-3 flex items-baseline justify-between gap-4 pt-2"
    >
      <Eyebrow as="span">{over ? "Plan exceeds income by" : label}</Eyebrow>
      <Money
        cents={over ? Math.abs(amount) : amount}
        tone={over ? "alert" : "neutral"}
        className="figure-md"
      />
    </div>
  );
}

function MonthPlan({
  plan,
  context,
}: {
  plan: MonthAllocationPlan;
  context: WidgetContext;
}) {
  const nextIncome = context.aggregates.cashHorizon(context.today, 60).nextIncome;
  return (
    <div>
      <div
        aria-label={`Expected income: ${formatCents(plan.expectedIncome)}`}
        className="flex flex-wrap items-end justify-between gap-3"
      >
        <div>
          <Eyebrow>{currentMonthName(context.today)} expected income</Eyebrow>
          <Marginalia className="mt-1 text-xs">
            {plan.incomeFromRules ? "From recurring income" : "Synced manual figure"}
          </Marginalia>
        </div>
        <Money cents={plan.expectedIncome} tone="in" className="figure-md" />
      </div>
      <div className="mt-3">
        <AmountRow label="Received" amount={plan.received} />
        <AmountRow label="Still scheduled" amount={plan.stillScheduled} />
      </div>
      <section className="mt-5" aria-labelledby="allocation-current-plan">
        <Eyebrow id="allocation-current-plan" as="h3">
          Current plan
        </Eyebrow>
        <div className="mt-1">
          <AmountRow
            label="Expense budgets"
            amount={plan.totalAllowances}
            displayAmount={-plan.totalAllowances}
          />
          <AmountRow
            label="Goal asks"
            amount={plan.totalGoalAsks}
            displayAmount={-plan.totalGoalAsks}
          />
        </div>
      </section>
      <AllocationTotal
        label="Unplanned expected income"
        amount={plan.unplanned}
        over={plan.overPlanned}
      />
      {nextIncome && (
        <Marginalia className="mt-3 text-xs">
          Includes {nextIncome.label} on {dateLabel(nextIncome.date)}.
        </Marginalia>
      )}
    </div>
  );
}

function AnchorPicker({
  context,
  rules,
  selected,
}: {
  context: WidgetContext;
  rules: RecurringRule[];
  selected: string[] | undefined;
}) {
  const selectedIds = new Set(selected ?? rules.map((rule) => rule.id));
  return (
    <details className="mt-4 border-t pt-3">
      <summary className="cursor-pointer list-none text-xs [&::-webkit-details-marker]:hidden">
        Income anchors · {selectedIds.size} selected
      </summary>
      <div className="mt-3 grid gap-2">
        {rules.map((rule) => (
          <label key={rule.id} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={selectedIds.has(rule.id)}
              disabled={selectedIds.has(rule.id) && selectedIds.size === 1}
              aria-label={`Use ${rule.template_vendor_source} as a pay-cycle anchor`}
              onCheckedChange={(checked) => {
                if (
                  checked !== true &&
                  selectedIds.has(rule.id) &&
                  selectedIds.size === 1
                ) {
                  return;
                }
                const next = new Set(selectedIds);
                if (checked === true) next.add(rule.id);
                else next.delete(rule.id);
                void context.saveInstanceSettings?.({
                  ...context.instanceSettings,
                  payCycleAnchorRuleIds: [...next].sort(),
                });
              }}
            />
            <span>{rule.template_vendor_source}</span>
          </label>
        ))}
      </div>
    </details>
  );
}

function PayCyclePlan({ plan }: { plan: PayCycleAllocationPlan }) {
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Eyebrow>
            {dateLabel(plan.start)} – {dateLabel(plan.end)}
          </Eyebrow>
          <p className="text-muted-foreground mt-1 text-xs">
            Next income in {plan.nextIncome.daysAway} days
          </p>
        </div>
        <Link href="/recurring" className="text-xs underline-offset-4 hover:underline">
          {plan.nextIncome.label} · {dateLabel(plan.nextIncome.date)}
        </Link>
      </div>
      <div
        aria-label={`Income for this cycle: ${formatCents(plan.income)}`}
        className="mt-4 flex items-baseline justify-between gap-3"
      >
        <span className="text-sm font-medium">Income for this cycle</span>
        <Money cents={plan.income} tone="in" className="figure-md" />
      </div>
      <section className="mt-5" aria-labelledby="allocation-needed">
        <Eyebrow id="allocation-needed" as="h3">
          Needed before {dateLabel(plan.nextIncome.date)}
        </Eyebrow>
        <div className="mt-1">
          {plan.scheduledExpenses.map((expense) => (
            <AmountRow
              key={expense.id}
              label={expense.label}
              amount={expense.amount}
              displayAmount={-expense.amount}
            />
          ))}
          <AmountRow
            label="Flexible budget share"
            amount={plan.flexibleBudgetShare}
            displayAmount={-plan.flexibleBudgetShare}
          />
          <AmountRow
            label="Goal asks"
            amount={plan.goalAskShare}
            displayAmount={-plan.goalAskShare}
          />
        </div>
      </section>
      <AllocationTotal
        label="Unplanned for this cycle"
        amount={plan.unplanned}
        over={plan.overPlanned}
      />
      <Marginalia className="mt-3 text-xs">
        Flexible share is explicitly pro-rated across{" "}
        {plan.start.slice(0, 7) === plan.end.slice(0, 7)
          ? "this month"
          : "both calendar months"}
        .
      </Marginalia>
    </div>
  );
}

function plans(context: WidgetContext) {
  const rules = incomeRules(context);
  const selected = anchorIds(context, rules);
  const payCycle = context.aggregates.allocationPayCycle(context.today, selected);
  const requestedMode = configuredMode(context);
  const mode: AllocationMode =
    requestedMode === "pay-cycle" && payCycle ? "pay-cycle" : "month";
  const month = context.aggregates.allocationMonth(context.today, manualIncome(context));
  return { rules, selected, payCycle, mode, month };
}

export function AllocationPlanExpanded(context: WidgetContext) {
  const resolved = plans(context);
  return (
    <div>
      {resolved.mode === "pay-cycle" && resolved.payCycle ? (
        <PayCyclePlan plan={resolved.payCycle} />
      ) : (
        <MonthPlan plan={resolved.month} context={context} />
      )}
      {configuredMode(context) === "pay-cycle" && resolved.payCycle === null && (
        <Marginalia className="mt-3 text-xs">
          Pay cycle needs a next scheduled income.{" "}
          <Link href="/recurring" className="underline underline-offset-4">
            Review income rules
          </Link>
          .
        </Marginalia>
      )}
    </div>
  );
}

export function AllocationPlanCompact(context: WidgetContext) {
  const resolved = plans(context);
  const pay = resolved.mode === "pay-cycle" ? resolved.payCycle : null;
  const income = pay?.income ?? resolved.month.expectedIncome;
  const planned = pay?.planned ?? resolved.month.planned;
  const unplanned = pay?.unplanned ?? resolved.month.unplanned;
  const over = pay?.overPlanned ?? resolved.month.overPlanned;
  return (
    <div>
      <Eyebrow>{resolved.mode === "pay-cycle" ? "Pay cycle" : "Month"}</Eyebrow>
      <div className="mt-3">
        <AmountRow label="Expected income" amount={income} />
        <AmountRow label="Planned" amount={planned} displayAmount={-planned} />
      </div>
      <AllocationTotal label="Unplanned" amount={unplanned} over={over} />
      {(pay?.nextIncome ??
        context.aggregates.cashHorizon(context.today, 60).nextIncome) && (
        <Marginalia className="mt-3 text-xs">
          {
            (pay?.nextIncome ??
              context.aggregates.cashHorizon(context.today, 60).nextIncome)!.label
          }{" "}
          due{" "}
          {dateLabel(
            (pay?.nextIncome ??
              context.aggregates.cashHorizon(context.today, 60).nextIncome)!.date,
          )}
          .
        </Marginalia>
      )}
    </div>
  );
}

export function AllocationPlanSettings(context: WidgetContext) {
  const resolved = plans(context);
  return (
    <div>
      <Eyebrow>Plan window</Eyebrow>
      <div className="mt-2 flex justify-start">
        <ModePicker
          context={context}
          mode={resolved.mode}
          payCycleAvailable={resolved.payCycle !== null}
        />
      </div>
      {resolved.payCycle ? (
        <AnchorPicker
          context={context}
          rules={resolved.rules}
          selected={resolved.selected}
        />
      ) : (
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Pay cycle needs a next scheduled income.
        </p>
      )}
    </div>
  );
}
