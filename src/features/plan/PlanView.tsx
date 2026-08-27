"use client";

import { useMemo, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { PencilIcon } from "lucide-react";
import { parseDollars } from "@/core/money";
import { monthlyPlan } from "@/core/engine/plan";
import { setSetting } from "@/core/commands";
import { categoryColorFor } from "@/features/category-color";
import {
  budgetTargetsAtom,
  categoriesAtom,
  dispatchAtom,
  expectedIncomeKey,
  goalsAtom,
  readyAtom,
  recurringRulesAtom,
  settingsAtom,
  goalFactsAtom,
} from "@/features/store";
import { cn } from "@/lib/utils";
import {
  Eyebrow,
  PageHeader,
  FigureSkeleton,
  LeaderRow,
  ListSkeleton,
  Marginalia,
  Money,
  RuledTotal,
} from "@/features/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { todayIso } from "@/features/clock";
import { InlineError } from "@/features/ui/InlineError";

const monthKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return monthKey(d);
}
function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

export function PlanView() {
  const ready = useAtomValue(readyAtom);
  const categories = useAtomValue(categoriesAtom);
  const goalFacts = useAtomValue(goalFactsAtom);
  const goals = useAtomValue(goalsAtom);
  const budgetTargets = useAtomValue(budgetTargetsAtom);
  const rules = useAtomValue(recurringRulesAtom);
  const settings = useAtomValue(settingsAtom);
  const dispatch = useSetAtom(dispatchAtom);

  const [today] = useState(() => todayIso());
  const [yearMonth, setYearMonth] = useState(() => monthKey(new Date()));
  const [editingIncome, setEditingIncome] = useState(false);
  const [incomeStr, setIncomeStr] = useState("");
  const [incomeError, setIncomeError] = useState("");

  const manualIncome = useMemo(() => {
    const s = settings.find((s) => s.key === expectedIncomeKey(yearMonth));
    return s ? Number(s.value) : 0;
  }, [settings, yearMonth]);

  const plan = useMemo(
    () =>
      monthlyPlan({
        yearMonth,
        today,
        txns: [],
        goalFacts,
        categories,
        goals,
        budgetTargets,
        rules,
        manualIncome,
      }),
    [yearMonth, today, goalFacts, categories, goals, budgetTargets, rules, manualIncome],
  );

  async function saveIncome() {
    setIncomeError("");
    let cents = 0;
    if (incomeStr.trim()) {
      try {
        cents = parseDollars(incomeStr);
      } catch {
        return setIncomeError("Enter a valid amount.");
      }
    }
    await dispatch(setSetting(expectedIncomeKey(yearMonth), String(cents)));
    setEditingIncome(false);
  }

  if (!ready)
    return (
      <div className="space-y-6">
        <FigureSkeleton />
        <div className="bg-card overflow-hidden rounded-2xl border">
          <ListSkeleton rows={4} />
        </div>
      </div>
    );

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Monthly allocation" title="Plan">
        Give the month&apos;s income a job — steady category allowances and goal
        contributions — until nothing is left unassigned.
      </PageHeader>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          className="rounded-full"
          onClick={() => setYearMonth((m) => shiftMonth(m, -1))}
        >
          ← Prev
        </Button>
        <span className="font-display min-w-40 text-center text-lg">
          {monthLabel(yearMonth)}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="rounded-full"
          onClick={() => setYearMonth((m) => shiftMonth(m, 1))}
        >
          Next →
        </Button>
      </div>

      <div className="bg-card overflow-hidden rounded-2xl border">
        {/* Income */}
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <div>
            <Eyebrow as="h2">Income expected</Eyebrow>
            <Marginalia className="mt-1">
              {plan.incomeFromRules
                ? "from your recurring income"
                : "entered for this month"}
            </Marginalia>
          </div>
          {editingIncome ? (
            <div className="flex flex-col items-end gap-1.5">
              <div className="flex items-center gap-1.5">
                <Input
                  autoFocus
                  value={incomeStr}
                  onChange={(e) => setIncomeStr(e.target.value)}
                  placeholder="0.00"
                  inputMode="decimal"
                  className="tnum h-8 w-28 font-mono"
                  aria-invalid={incomeError ? "true" : undefined}
                  aria-describedby={incomeError ? "expected-income-error" : undefined}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void saveIncome();
                    if (e.key === "Escape") setEditingIncome(false);
                  }}
                />
                <Button size="sm" className="h-8 rounded-lg" onClick={saveIncome}>
                  Save
                </Button>
              </div>
              {incomeError && (
                <InlineError id="expected-income-error">{incomeError}</InlineError>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Money cents={plan.income} tone="in" className="figure-md" />
              {!plan.incomeFromRules && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-muted-foreground size-7 rounded-lg"
                  aria-label="Edit expected income"
                  onClick={() => {
                    setIncomeStr(plan.income ? (plan.income / 100).toFixed(2) : "");
                    setIncomeError("");
                    setEditingIncome(true);
                  }}
                >
                  <PencilIcon className="size-3.5" />
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Allowances */}
        <Section
          title="Allowances"
          totalLabel="Total allowances"
          total={plan.totalAllowances}
          empty="No budgets set for this month."
        >
          {plan.allowances.map((a) => (
            <LeaderRow
              key={a.categoryId}
              dot={categoryColorFor(a.categoryId, categories)}
              label={a.name}
            >
              <Money cents={a.amount} tone="quiet" />
            </LeaderRow>
          ))}
        </Section>

        {/* Goal asks */}
        <Section
          title="Goal asks"
          totalLabel="Total asks"
          total={plan.totalAsks}
          empty="No active goals asking for a contribution."
        >
          {plan.asks.map((a) => (
            <LeaderRow key={a.goalId} dot="var(--muted-foreground)" label={a.name}>
              <Money cents={a.amount} tone="quiet" />
            </LeaderRow>
          ))}
        </Section>

        {/* What is left. The double rule is the accounting mark for a line
            nothing further is added to — this is the end of the sum. */}
        <div
          className={cn(
            "px-5 pt-2 pb-5",
            plan.overAllocated ? "bg-destructive/8" : "bg-surface-sunken",
          )}
        >
          <RuledTotal
            label={plan.overAllocated ? "Over-committed" : "Unallocated"}
            cents={plan.unallocated}
            tone={plan.overAllocated ? "alert" : "neutral"}
            emphasis="grand"
          />
          <Marginalia className="mt-1.5">
            {plan.overAllocated
              ? "you've committed more than you expect to earn"
              : "give it a job, or leave it for later"}
          </Marginalia>
        </div>
      </div>
    </div>
  );
}

/**
 * A named block of the plan: its rows, then the rule, then its total. The total
 * sits UNDER the rows it sums — a figure printed above its own addends is a
 * heading, not a total.
 */
function Section({
  title,
  total,
  totalLabel,
  empty,
  children,
}: {
  title: string;
  total: number;
  totalLabel: string;
  empty: string;
  children: React.ReactNode;
}) {
  const hasItems = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div className="border-t px-5 py-4">
      <Eyebrow as="h2">{title}</Eyebrow>
      {hasItems ? (
        <>
          <div className="mt-2.5">{children}</div>
          <RuledTotal label={totalLabel} cents={total} />
        </>
      ) : (
        <p className="text-muted-foreground mt-2 text-xs">{empty}</p>
      )}
    </div>
  );
}
