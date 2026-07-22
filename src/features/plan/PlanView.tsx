"use client";

import { useMemo, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { toast } from "sonner";
import { PencilIcon } from "lucide-react";
import { formatCents, parseDollars } from "@/core/money";
import { monthlyPlan } from "@/core/engine/plan";
import { setSetting } from "@/core/commands";
import { categoryDotColor } from "@/features/category-color";
import {
  budgetTargetsAtom,
  categoriesAtom,
  dispatchAtom,
  expectedIncomeKey,
  goalsAtom,
  readyAtom,
  recurringRulesAtom,
  settingsAtom,
  transactionsAtom,
} from "@/features/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  const txns = useAtomValue(transactionsAtom);
  const goals = useAtomValue(goalsAtom);
  const budgetTargets = useAtomValue(budgetTargetsAtom);
  const rules = useAtomValue(recurringRulesAtom);
  const settings = useAtomValue(settingsAtom);
  const dispatch = useSetAtom(dispatchAtom);

  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  const [yearMonth, setYearMonth] = useState(() => monthKey(new Date()));
  const [editingIncome, setEditingIncome] = useState(false);
  const [incomeStr, setIncomeStr] = useState("");

  const manualIncome = useMemo(() => {
    const s = settings.find((s) => s.key === expectedIncomeKey(yearMonth));
    return s ? Number(s.value) : 0;
  }, [settings, yearMonth]);

  const plan = useMemo(
    () =>
      monthlyPlan({
        yearMonth,
        today,
        txns,
        categories,
        goals,
        budgetTargets,
        rules,
        manualIncome,
      }),
    [yearMonth, today, txns, categories, goals, budgetTargets, rules, manualIncome],
  );

  async function saveIncome() {
    let cents = 0;
    if (incomeStr.trim()) {
      try {
        cents = parseDollars(incomeStr);
      } catch {
        return toast.error("Enter a valid amount.");
      }
    }
    await dispatch(setSetting(expectedIncomeKey(yearMonth), String(cents)));
    setEditingIncome(false);
    toast.success("Expected income updated");
  }

  if (!ready) return <p className="text-muted-foreground py-16 text-sm">Loading…</p>;

  return (
    <div className="space-y-6">
      <section className="flex items-end justify-between pt-3 pb-1">
        <div>
          <p className="text-muted-foreground text-xs font-medium tracking-[0.18em] uppercase">
            Monthly plan
          </p>
          <h1 className="font-display mt-1 text-3xl leading-none">
            Every dollar a purpose
          </h1>
          <p className="text-muted-foreground mt-3 max-w-md text-sm">
            Give the month&apos;s income a job — steady category allowances and goal
            contributions — until nothing is left unassigned.
          </p>
        </div>
      </section>

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
        <div className="flex items-center justify-between px-5 py-4">
          <div>
            <p className="text-sm font-medium">Income expected</p>
            <p className="text-muted-foreground text-xs">
              {plan.incomeFromRules
                ? "From your recurring income"
                : "Entered for this month"}
            </p>
          </div>
          {editingIncome ? (
            <div className="flex items-center gap-1.5">
              <Input
                autoFocus
                value={incomeStr}
                onChange={(e) => setIncomeStr(e.target.value)}
                placeholder="0.00"
                inputMode="decimal"
                className="tnum h-8 w-28 font-mono"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void saveIncome();
                  if (e.key === "Escape") setEditingIncome(false);
                }}
              />
              <Button size="sm" className="h-8 rounded-lg" onClick={saveIncome}>
                Save
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-positive tnum font-mono">
                {formatCents(plan.income)}
              </span>
              {!plan.incomeFromRules && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-muted-foreground size-7 rounded-lg"
                  aria-label="Edit expected income"
                  onClick={() => {
                    setIncomeStr(plan.income ? (plan.income / 100).toFixed(2) : "");
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
          title="Category allowances"
          subtitle="Steady monthly spend"
          total={plan.totalAllowances}
          empty="No budgets set for this month."
        >
          {plan.allowances.map((a) => (
            <Row
              key={a.categoryId}
              dot={categoryDotColor(a.categoryId)}
              label={a.name}
              amount={a.amount}
            />
          ))}
        </Section>

        {/* Goal asks */}
        <Section
          title="Goal contributions"
          subtitle="Saving toward a target"
          total={plan.totalAsks}
          empty="No active goals asking for a contribution."
        >
          {plan.asks.map((a) => (
            <Row key={a.goalId} label={a.name} amount={a.amount} />
          ))}
        </Section>

        {/* Unallocated */}
        <div
          className={cn(
            "flex items-center justify-between px-5 py-4",
            plan.overAllocated ? "bg-destructive/8" : "bg-muted/40",
          )}
        >
          <div>
            <p className="text-sm font-medium">
              {plan.overAllocated ? "Over-committed" : "Unallocated"}
            </p>
            <p className="text-muted-foreground text-xs">
              {plan.overAllocated
                ? "You've committed more than you expect to earn."
                : "Give it a job, or leave it for later."}
            </p>
          </div>
          <span
            className={cn(
              "tnum font-mono text-lg",
              plan.overAllocated ? "text-destructive" : "",
            )}
          >
            {formatCents(plan.unallocated)}
          </span>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  total,
  empty,
  children,
}: {
  title: string;
  subtitle: string;
  total: number;
  empty: string;
  children: React.ReactNode;
}) {
  const hasItems = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div className="border-t">
      <div className="flex items-center justify-between px-5 pt-4 pb-1">
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-muted-foreground text-xs">{subtitle}</p>
        </div>
        <span className="text-muted-foreground tnum font-mono">
          − {formatCents(total)}
        </span>
      </div>
      {hasItems ? (
        <div className="px-5 pb-2">{children}</div>
      ) : (
        <p className="text-muted-foreground px-5 pb-4 text-xs">{empty}</p>
      )}
    </div>
  );
}

function Row({ dot, label, amount }: { dot?: string; label: string; amount: number }) {
  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: dot ?? "var(--muted-foreground)" }}
        aria-hidden
      />
      <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
      <span className="tnum text-muted-foreground font-mono text-sm">
        {formatCents(amount)}
      </span>
    </div>
  );
}
