"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { toast } from "sonner";
import { TargetIcon } from "lucide-react";
import { activeRows, isTransfer } from "@/core/engine";
import { formatCents, parseDollars } from "@/core/money";
import type { Category, Container, CravingWin, Goal, Transaction } from "@/core/model";
import {
  dateTimeInputValue,
  instantFrom,
  instantFromNow,
  nowDateTimeInput,
  splitDateTime,
} from "@/features/clock";
import {
  composeCravingWin,
  type CravingWinComposeOutcome,
} from "@/features/cravings/compose";
import {
  categoriesAtom,
  containersAtom,
  cravingWinsAtom,
  cravingWinSheetAtom,
  defaultContainerIdAtom,
  dispatchManyAtom,
  flashRowAtom,
  goalsAtom,
  runGoalMaintenanceAtom,
} from "@/features/store";
import { useLedgerEntriesById } from "@/features/useLedgerEntries";
import { ResponsiveSheet } from "@/features/ui";
import { InlineError } from "@/features/ui/InlineError";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SheetFooter } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
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

const NO_CATEGORY = "__none__";

export function CravingWinSheet() {
  const selected = useAtomValue(cravingWinSheetAtom);
  const wins = useAtomValue(cravingWinsAtom);
  const categories = useAtomValue(categoriesAtom);
  const containers = useAtomValue(containersAtom);
  const goals = useAtomValue(goalsAtom);
  const defaultContainerId = useAtomValue(defaultContainerIdAtom);
  const setSelected = useSetAtom(cravingWinSheetAtom);
  const dispatchMany = useSetAtom(dispatchManyAtom);
  const maintainGoals = useSetAtom(runGoalMaintenanceAtom);
  const flashRow = useSetAtom(flashRowAtom);
  const existing =
    selected && selected !== "new"
      ? (wins.find((win) => win.id === selected) ?? null)
      : null;
  const open = selected === "new" || existing !== null;
  const transferIds = existing?.transfer_transaction_id
    ? [existing.transfer_transaction_id]
    : [];
  const transactions = useLedgerEntriesById(transferIds);

  async function save(result: Extract<CravingWinComposeOutcome, { status: "ready" }>) {
    await dispatchMany(result.ops);
    await maintainGoals();
    setSelected(null);
    flashRow({ id: result.row.id });
    toast.success(existing ? "Win updated" : "Win logged", {
      description: `${formatCents(result.row.amount_kept)} kept${result.transfer ? " · moved to a goal" : ""}`,
    });
  }

  return (
    <CravingWinFormSheet
      open={open}
      existing={existing}
      categories={categories}
      containers={containers}
      goals={goals}
      transactions={transactions ?? []}
      defaultContainerId={defaultContainerId}
      onOpenChange={(next) => !next && setSelected(null)}
      onSave={save}
    />
  );
}

export function CravingWinFormSheet({
  open,
  existing,
  categories,
  containers,
  goals,
  transactions,
  defaultContainerId,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  existing: CravingWin | null;
  categories: Category[];
  containers: Container[];
  goals: Goal[];
  transactions: Transaction[];
  defaultContainerId: string;
  onOpenChange: (open: boolean) => void;
  onSave: (
    result: Extract<CravingWinComposeOutcome, { status: "ready" }>,
  ) => Promise<void>;
}) {
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={existing ? "Edit craving win" : "Log a craving win"}
      description="Record what you chose not to spend. Only an optional goal transfer changes your balances."
    >
      {open && transactions !== null && (
        <CravingWinForm
          key={existing?.id ?? "new"}
          existing={existing}
          categories={categories}
          containers={containers}
          goals={goals}
          transactions={transactions}
          defaultContainerId={defaultContainerId}
          onOpenChange={onOpenChange}
          onSave={onSave}
        />
      )}
    </ResponsiveSheet>
  );
}

function CravingWinForm({
  existing,
  categories,
  containers,
  goals,
  transactions,
  defaultContainerId,
  onOpenChange,
  onSave,
}: Omit<React.ComponentProps<typeof CravingWinFormSheet>, "open">) {
  const liveTransfer = useMemo(() => {
    if (!existing?.transfer_transaction_id) return null;
    return (
      activeRows(transactions).find(
        (transaction) =>
          transaction.id === existing.transfer_transaction_id && isTransfer(transaction),
      ) ?? null
    );
  }, [existing, transactions]);
  const selectableGoals = useMemo(
    () =>
      goals.filter(
        (goal) =>
          (goal.status === "active" && !goal.is_archived) ||
          (liveTransfer !== null && goal.id === existing?.goal_id),
      ),
    [existing?.goal_id, goals, liveTransfer],
  );
  const selectableCategories = useMemo(
    () =>
      categories.filter(
        (category) =>
          category.type === "expense" &&
          (!category.is_archived || category.id === existing?.category_id),
      ),
    [categories, existing?.category_id],
  );
  const selectableContainers = useMemo(
    () =>
      containers.filter(
        (container) =>
          !container.is_archived || container.id === liveTransfer?.container_id,
      ),
    [containers, liveTransfer?.container_id],
  );
  const goalName = (goal: Goal): string =>
    goal.name ??
    containers.find((container) => container.id === goal.container_id)?.name ??
    "Goal";
  const initialWhen = existing
    ? dateTimeInputValue(existing.date, existing.occurred_at)
    : nowDateTimeInput();
  const initialGoalId = liveTransfer
    ? (existing?.goal_id ?? "")
    : (selectableGoals[0]?.id ?? "");
  const initialGoal = selectableGoals.find((goal) => goal.id === initialGoalId);
  const initialFundingId = liveTransfer?.container_id ?? defaultContainerId;
  const safeInitialFunding =
    initialFundingId !== initialGoal?.container_id
      ? initialFundingId
      : (selectableContainers.find(
          (container) => container.id !== initialGoal?.container_id,
        )?.id ?? "");

  const [description, setDescription] = useState(existing?.description ?? "");
  const [amountStr, setAmountStr] = useState(
    existing ? (existing.amount_kept / 100).toFixed(2) : "",
  );
  const [when, setWhen] = useState(initialWhen);
  const [categoryId, setCategoryId] = useState(existing?.category_id ?? NO_CATEGORY);
  const [reflection, setReflection] = useState(existing?.reflection ?? "");
  const [setAside, setSetAside] = useState(liveTransfer !== null);
  const [goalId, setGoalId] = useState(initialGoalId);
  const [fundingContainerId, setFundingContainerId] = useState(safeInitialFunding);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<Extract<
    CravingWinComposeOutcome,
    { status: "ready" }
  > | null>(null);
  const [saving, setSaving] = useState(false);

  const selectedGoal = selectableGoals.find((goal) => goal.id === goalId) ?? null;
  const fundingOptions = selectableContainers.filter(
    (container) => container.id !== selectedGoal?.container_id,
  );

  async function commit(result: Extract<CravingWinComposeOutcome, { status: "ready" }>) {
    setSaving(true);
    try {
      await onSave(result);
    } finally {
      setSaving(false);
      setPending(null);
    }
  }

  function prepare(): CravingWinComposeOutcome {
    const { date, time } = splitDateTime(when);
    const occurredAt =
      existing && when === initialWhen
        ? existing.occurred_at
        : existing
          ? instantFrom(date, time)
          : instantFromNow(date, time);
    if (!occurredAt) return { status: "error", message: "Pick a valid date and time." };
    return composeCravingWin(
      {
        description,
        amountStr,
        date,
        occurredAt,
        categoryId: categoryId === NO_CATEGORY ? null : categoryId,
        reflection,
        setAside,
        goalId,
        fundingContainerId,
      },
      { existing, goals, containers, transactions },
    );
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const result = prepare();
    if (result.status === "error") return setError(result.message);
    if (result.confirmation) return setPending(result);
    void commit(result);
  }

  let submitLabel = existing ? "Save changes" : "Log win";
  if (!existing && setAside) {
    try {
      const amount = parseDollars(amountStr);
      if (amount > 0) submitLabel = `Log win and move ${formatCents(amount)}`;
    } catch {
      // Keep the stable fallback while the amount is half-typed.
    }
  }

  return (
    <>
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <div className="grid gap-4 px-4">
          {error && <InlineError id="craving-win-error">{error}</InlineError>}

          <div className="flex items-center justify-center gap-1 py-1">
            <span className="text-muted-foreground tnum font-mono text-3xl" aria-hidden>
              $
            </span>
            <Input
              value={amountStr}
              onChange={(event) => setAmountStr(event.target.value)}
              placeholder="0.00"
              inputMode="decimal"
              aria-label="Amount kept"
              className="tnum h-14 w-44 border-0 bg-transparent p-0 font-mono text-4xl shadow-none focus-visible:ring-0 md:text-4xl"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="craving-description">What did you pass up?</Label>
            <Input
              id="craving-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="e.g. Takeout"
              autoFocus
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="craving-when">When</Label>
            <Input
              id="craving-when"
              type="datetime-local"
              value={when}
              onChange={(event) => setWhen(event.target.value)}
              className="tnum font-mono"
            />
          </div>

          <div className="grid gap-1.5">
            <Label>Category (optional)</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger aria-label="Category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CATEGORY}>No category</SelectItem>
                {selectableCategories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              For reflection only. It never changes category spending or budgets.
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="craving-reflection">Why did you pass? (optional)</Label>
            <Textarea
              id="craving-reflection"
              value={reflection}
              onChange={(event) => setReflection(event.target.value)}
              placeholder="A note to your future self"
              rows={3}
              className="resize-none"
            />
          </div>

          <label className="flex items-start gap-2.5 text-sm">
            <Checkbox
              checked={setAside}
              disabled={selectableGoals.length === 0}
              onCheckedChange={(value) => setSetAside(value === true)}
              className="mt-0.5"
            />
            <span>
              Put this toward a goal
              <span className="text-muted-foreground block text-xs">
                Moves the full amount as real money from one container to the goal.
              </span>
            </span>
          </label>

          {selectableGoals.length === 0 && (
            <p className="text-muted-foreground text-xs">
              Create an active goal before moving this money.{" "}
              <Link
                href="/goals"
                className="text-primary underline underline-offset-2"
                onClick={() => onOpenChange(false)}
              >
                Go to goals
              </Link>
            </p>
          )}

          {setAside && selectableGoals.length > 0 && (
            <div className="border-primary/20 bg-primary/[0.035] grid gap-4 rounded-xl border p-4">
              <div className="grid gap-1.5">
                <Label>Goal</Label>
                <Select
                  value={goalId}
                  onValueChange={(next) => {
                    setGoalId(next);
                    const destination = selectableGoals.find(
                      (goal) => goal.id === next,
                    )?.container_id;
                    if (destination === fundingContainerId) {
                      setFundingContainerId(
                        selectableContainers.find(
                          (container) => container.id !== destination,
                        )?.id ?? "",
                      );
                    }
                  }}
                >
                  <SelectTrigger aria-label="Goal">
                    <SelectValue placeholder="Goal" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectableGoals.map((goal) => (
                      <SelectItem key={goal.id} value={goal.id}>
                        <TargetIcon className="size-4" />
                        {goalName(goal)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-1.5">
                <Label>From</Label>
                <Select value={fundingContainerId} onValueChange={setFundingContainerId}>
                  <SelectTrigger aria-label="From container">
                    <SelectValue placeholder="Container" />
                  </SelectTrigger>
                  <SelectContent>
                    {fundingOptions.map((container) => (
                      <SelectItem key={container.id} value={container.id}>
                        {container.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>

        <SheetFooter className="mt-auto">
          <Button type="submit" disabled={saving}>
            {submitLabel}
          </Button>
        </SheetFooter>
      </form>

      <AlertDialog
        open={pending !== null}
        onOpenChange={(next) => !next && setPending(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.confirmation?.kind === "reverse-transfer"
                ? "Move the linked money back?"
                : "Update the linked transfer?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.confirmation?.kind === "reverse-transfer"
                ? "Saving this change reverses the real transfer and removes the goal link."
                : "The amount, date, source, or goal changed. Saving also updates the real transfer."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => pending && void commit(pending)}>
              {pending?.confirmation?.kind === "reverse-transfer"
                ? "Save and move back"
                : "Save and update transfer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
