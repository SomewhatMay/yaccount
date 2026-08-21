"use client";

import { useMemo, useState } from "react";
import { PencilIcon, Trash2Icon } from "lucide-react";
import { removeBudgetTarget, setBudgetTarget } from "@/core/commands";
import { formatCents, parseDollars } from "@/core/money";
import type { BudgetTarget, Category } from "@/core/model";
import type { Op } from "@/core/oplog";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SheetFooter } from "@/components/ui/sheet";
import { ResponsiveSheet, RowActions } from "@/features/ui";
import { InlineError } from "@/features/ui/InlineError";
import { todayIso } from "@/features/clock";
import { Eyebrow } from "@/features/ui";

/**
 * A category's budget over time (§5.3) — no end_date, just "effective from."
 * Every change is kept as its own row, so history is never overwritten; a
 * mistaken one can be corrected or removed, same editing pattern as reported
 * balances (§12.4-a) — a history list, not a write-only form.
 */
export function BudgetSheet({
  category,
  budgetTargets,
  onOpenChange,
  onDispatch,
}: {
  category: Category | null;
  budgetTargets: BudgetTarget[];
  onOpenChange: (open: boolean) => void;
  onDispatch: (op: Op) => Promise<void>;
}) {
  return (
    <ResponsiveSheet
      open={category !== null}
      onOpenChange={onOpenChange}
      title="Budget"
      description={`What ${category?.name ?? "this category"} allows each month. Set a new amount whenever it changes — old months keep the amount that applied then.`}
    >
      {category && (
        <BudgetHistory
          key={category.id}
          category={category}
          budgetTargets={budgetTargets}
          onDispatch={onDispatch}
        />
      )}
    </ResponsiveSheet>
  );
}

function BudgetHistory({
  category,
  budgetTargets,
  onDispatch,
}: {
  category: Category;
  budgetTargets: BudgetTarget[];
  onDispatch: (op: Op) => Promise<void>;
}) {
  const history = useMemo(
    () =>
      budgetTargets
        .filter((b) => b.category_id === category.id)
        .sort((a, b) =>
          a.start_date < b.start_date ? 1 : a.start_date > b.start_date ? -1 : 0,
        ),
    [budgetTargets, category.id],
  );
  const activeRow = useMemo(
    () => history.find((b) => b.start_date <= todayIso()),
    [history],
  );

  const [editing, setEditing] = useState<BudgetTarget | null>(null);
  const [removing, setRemoving] = useState<BudgetTarget | null>(null);
  const [startDate, setStartDate] = useState(todayIso());
  const [amountStr, setAmountStr] = useState("");
  const [error, setError] = useState("");

  // Unique per (category_id, start_date) (§5.3): saving onto an occupied date
  // replaces it, so say so before the user commits rather than surprising them.
  const clash = history.find((b) => b.start_date === startDate && b.id !== editing?.id);

  function startEdit(b: BudgetTarget) {
    setEditing(b);
    setStartDate(b.start_date);
    setAmountStr((b.amount / 100).toFixed(2));
  }

  function cancelEdit() {
    setEditing(null);
    setStartDate(todayIso());
    setAmountStr("");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    let amount: number;
    try {
      amount = parseDollars(amountStr);
    } catch {
      return setError("Enter a valid amount.");
    }
    if (amount < 0) return setError("Budgets can't be negative.");

    try {
      await onDispatch(
        setBudgetTarget({
          id: editing?.id,
          category_id: category.id,
          amount,
          start_date: startDate,
        }),
      );
      cancelEdit();
    } catch {
      setError("Couldn't save the budget. Try again.");
    }
  }

  async function remove(b: BudgetTarget) {
    setRemoving(null);
    if (editing?.id === b.id) cancelEdit();
    await onDispatch(removeBudgetTarget(b.id));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <form onSubmit={save} className="grid gap-4 px-4">
        <div className="grid gap-1.5">
          <Label htmlFor="budget-start-date">Effective from</Label>
          <Input
            id="budget-start-date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          {clash && (
            <p className="text-muted-foreground text-xs">
              This date already sets {formatCents(clash.amount)}/mo — saving replaces it.
            </p>
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="budget-amount">Monthly amount</Label>
          <Input
            id="budget-amount"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            placeholder="0.00"
            inputMode="decimal"
            className="tnum font-mono"
            aria-invalid={error ? "true" : undefined}
            aria-describedby={error ? "budget-error" : undefined}
          />
          {error && <InlineError id="budget-error">{error}</InlineError>}
        </div>
        <div className="flex items-center gap-2">
          <Button type="submit">{editing ? "Save changes" : "Set budget"}</Button>
          {editing && (
            <Button
              type="button"
              variant="ghost"
              className="text-muted-foreground"
              onClick={cancelEdit}
            >
              Cancel
            </Button>
          )}
        </div>
      </form>

      <div className="mt-6 px-4 pb-4">
        <Eyebrow as="h3" className="mb-2 px-1">
          History
        </Eyebrow>
        <div className="bg-card overflow-hidden rounded-2xl border">
          {history.length === 0 ? (
            <p className="text-muted-foreground px-4 py-8 text-center text-sm">
              No budget set yet. Set the first one above.
            </p>
          ) : (
            history.map((b, i) => (
              <div
                key={b.id}
                className={cn(
                  "group hover:bg-muted/40 flex items-center gap-3 px-4 py-2.5 transition-colors",
                  i > 0 && "border-t",
                  editing?.id === b.id && "bg-primary/[0.06]",
                )}
              >
                <span className="flex-1 text-sm">
                  {b.start_date}
                  {b.id === activeRow?.id && (
                    <Badge variant="secondary" className="ml-2 rounded-full text-[10px]">
                      Current
                    </Badge>
                  )}
                </span>
                <span className="tnum font-mono text-sm">{formatCents(b.amount)}/mo</span>
                <RowActions label={`Actions for the ${b.start_date} budget`}>
                  <DropdownMenuItem onClick={() => startEdit(b)}>
                    <PencilIcon className="size-4" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onClick={() => setRemoving(b)}>
                    <Trash2Icon className="size-4" />
                    Delete
                  </DropdownMenuItem>
                </RowActions>
              </div>
            ))
          )}
        </div>
        {history.length > 0 && (
          <p className="text-muted-foreground mt-2 px-1 text-xs">
            {activeRow
              ? `Applies today: ${formatCents(activeRow.amount)}/mo.`
              : "No budget applies yet — the earliest row is dated in the future."}
          </p>
        )}
      </div>

      <SheetFooter className="mt-auto" />

      <AlertDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this budget row?</AlertDialogTitle>
            <AlertDialogDescription>
              {removing
                ? `${formatCents(removing.amount)}/mo from ${removing.start_date} leaves the history.`
                : ""}{" "}
              No transactions are affected — a budget is a planning target, not money
              moving.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={() => removing && remove(removing)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
