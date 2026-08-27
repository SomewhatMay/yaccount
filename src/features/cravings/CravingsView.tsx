"use client";

import { useMemo, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { toast } from "sonner";
import {
  PencilIcon,
  PiggyBankIcon,
  PlusIcon,
  TargetIcon,
  Trash2Icon,
} from "lucide-react";
import { createCravingWin, unvoidTransaction } from "@/core/commands";
import {
  cravingWinCumulativeSeries,
  cravingWinSummary,
  groupCravingWinsByYear,
  isTransfer,
  type CravingWinSummary,
  type CravingWinYear,
} from "@/core/engine";
import { formatCents } from "@/core/money";
import type { Category, CravingWin, Goal } from "@/core/model";
import { categoryColor } from "@/features/category-color";
import { CategoryGlyph } from "@/features/category-icons";
import { formatEnteredTime, todayIso } from "@/features/clock";
import { composeCravingWinRemoval } from "@/features/cravings/compose";
import {
  categoriesAtom,
  containersAtom,
  cravingWinsAtom,
  cravingWinSheetAtom,
  dispatchManyAtom,
  flashRowAtom,
  goalsAtom,
  readyAtom,
  runGoalMaintenanceAtom,
} from "@/features/store";
import { useLedgerEntriesById } from "@/features/useLedgerEntries";
import {
  EmptyState,
  Eyebrow,
  FigureSkeleton,
  ListSkeleton,
  Money,
  RowActions,
  RuledTotal,
  Sparkline,
  useFlashRow,
} from "@/features/ui";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
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

const DAY = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const SCREEN_TITLE_CLASS =
  "font-display col-start-1 row-start-1 text-xl font-semibold tracking-tight sm:row-start-2 sm:mt-1.5 sm:text-2xl";

function dayLabel(date: string): string {
  return DAY.format(new Date(`${date}T00:00:00`));
}

export function CravingsView({ today = todayIso() }: { today?: string } = {}) {
  const ready = useAtomValue(readyAtom);
  const wins = useAtomValue(cravingWinsAtom);
  const categories = useAtomValue(categoriesAtom);
  const containers = useAtomValue(containersAtom);
  const goals = useAtomValue(goalsAtom);
  const openSheet = useSetAtom(cravingWinSheetAtom);
  const dispatchMany = useSetAtom(dispatchManyAtom);
  const maintainGoals = useSetAtom(runGoalMaintenanceAtom);
  const flashRow = useSetAtom(flashRowAtom);
  const [deleting, setDeleting] = useState<CravingWin | null>(null);
  const transferIds = useMemo(
    () =>
      wins.flatMap((win) =>
        win.transfer_transaction_id ? [win.transfer_transaction_id] : [],
      ),
    [wins],
  );
  const transactions = useLedgerEntriesById(transferIds);

  const summary = useMemo(
    () => (transactions ? cravingWinSummary(wins, transactions, today) : null),
    [today, transactions, wins],
  );
  const series = useMemo(() => cravingWinCumulativeSeries(wins), [wins]);
  const groups = useMemo(() => groupCravingWinsByYear(wins), [wins]);
  const liveTransferIds = useMemo(
    () =>
      new Set(
        (transactions ?? []).filter(isTransfer).map((transaction) => transaction.id),
      ),
    [transactions],
  );
  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );
  const containerById = useMemo(
    () => new Map(containers.map((container) => [container.id, container])),
    [containers],
  );
  const goalNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const goal of goals) {
      map.set(goal.id, goal.name ?? containerById.get(goal.container_id)?.name ?? "Goal");
    }
    return map;
  }, [containerById, goals]);

  async function remove(win: CravingWin, reverseTransfer: boolean) {
    const result = composeCravingWinRemoval(win, transactions ?? [], reverseTransfer);
    await dispatchMany(result.ops);
    await maintainGoals();
    setDeleting(null);
    toast.success("Win deleted", {
      description: reverseTransfer
        ? `${formatCents(win.amount_kept)} moved back`
        : `${formatCents(win.amount_kept)} removed from Cravings Savings`,
      action: {
        label: "Undo",
        onClick: () => {
          const ops = [createCravingWin(win)];
          if (result.reversal) ops.push(unvoidTransaction(result.reversal));
          void dispatchMany(ops).then(async () => {
            await maintainGoals();
            flashRow({ id: win.id });
            toast.success("Win restored");
          });
        },
      },
    });
  }

  if (!ready || summary === null) {
    return (
      <div className="space-y-6">
        <FigureSkeleton />
        <div className="bg-card overflow-hidden rounded-2xl border">
          <ListSkeleton rows={4} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <CravingsHero summary={summary} series={series} onNew={() => openSheet("new")} />

      {groups.length === 0 ? (
        <div className="bg-card rounded-2xl border">
          <EmptyState
            icon={PiggyBankIcon}
            title="No craving wins yet"
            action={
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => openSheet("new")}
              >
                <PlusIcon className="size-4" />
                Log a win
              </Button>
            }
          >
            Next time you pass on an impulse, record what you kept and optionally move it
            toward a goal.
          </EmptyState>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <YearRegister
              key={group.year}
              group={group}
              categoryById={categoryById}
              goalNameById={goalNameById}
              liveTransferIds={liveTransferIds}
              onEdit={(win) => openSheet(win.id)}
              onDelete={setDeleting}
            />
          ))}
        </div>
      )}

      {deleting && (
        <CravingDeleteDialog
          win={deleting}
          hasLiveTransfer={Boolean(
            deleting.transfer_transaction_id &&
            liveTransferIds.has(deleting.transfer_transaction_id),
          )}
          onOpenChange={(open) => !open && setDeleting(null)}
          onDelete={(reverse) => void remove(deleting, reverse)}
        />
      )}
    </div>
  );
}

export function CravingsHero({
  summary,
  series,
  onNew,
}: {
  summary: CravingWinSummary;
  series: number[];
  onNew: () => void;
}) {
  return (
    <section className="pt-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
        <Eyebrow className="hidden sm:col-start-1 sm:row-start-1 sm:block">
          Saved choices
        </Eyebrow>
        <h1 className={SCREEN_TITLE_CLASS}>Cravings</h1>
        <Button className="rounded-full" onClick={onNew}>
          <PlusIcon className="size-4" />
          New
        </Button>
        <p className="text-muted-foreground col-span-2 mt-3 hidden max-w-md text-sm sm:block">
          An estimate of spending you avoided. Only linked goal transfers change your
          balances.
        </p>
      </div>
      <div className="mt-4">
        <Eyebrow>Savings kept</Eyebrow>
        <p className="figure-hero mt-1.5">{formatCents(summary.totalKept)}</p>
      </div>
      {series.length > 1 && (
        <Sparkline
          values={series}
          area
          height={40}
          strokeWidth={1.25}
          className="text-brand/60 mt-3 max-w-md"
        />
      )}
      <div className="text-muted-foreground mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <span>
          <span className="text-foreground tnum font-mono">{summary.winCount}</span>{" "}
          {summary.winCount === 1 ? "win" : "wins"}
        </span>
        <span>
          <Money cents={summary.thisMonthKept} className="text-foreground" /> this month
        </span>
        {summary.movedToGoals > 0 && (
          <span>
            <Money cents={summary.movedToGoals} className="text-foreground" /> moved to
            goals
          </span>
        )}
      </div>
    </section>
  );
}

export function YearRegister({
  group,
  categoryById,
  goalNameById,
  liveTransferIds,
  onEdit,
  onDelete,
}: {
  group: CravingWinYear;
  categoryById: Map<string, Category>;
  goalNameById: Map<string, string>;
  liveTransferIds: Set<string>;
  onEdit: (win: CravingWin) => void;
  onDelete: (win: CravingWin) => void;
}) {
  return (
    <section className="bg-card overflow-clip rounded-2xl border">
      <div className="bg-surface-sunken px-5 py-2.5">
        <Eyebrow as="h2">{group.year}</Eyebrow>
      </div>
      <div className="divide-y">
        {group.wins.map((win) => (
          <CravingWinRow
            key={win.id}
            win={win}
            category={
              win.category_id ? (categoryById.get(win.category_id) ?? null) : null
            }
            goalName={win.goal_id ? (goalNameById.get(win.goal_id) ?? "Goal") : null}
            transferLive={Boolean(
              win.transfer_transaction_id &&
              liveTransferIds.has(win.transfer_transaction_id),
            )}
            onEdit={() => onEdit(win)}
            onDelete={() => onDelete(win)}
          />
        ))}
      </div>
      <div className="px-5 pt-1 pb-4">
        <RuledTotal
          label={`${group.year} kept · ${group.winCount} ${group.winCount === 1 ? "win" : "wins"}`}
          cents={group.totalKept}
        />
      </div>
    </section>
  );
}

function CravingWinRow({
  win,
  category,
  goalName,
  transferLive,
  onEdit,
  onDelete,
}: {
  win: CravingWin;
  category: Category | null;
  goalName: string | null;
  transferLive: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { ref, flashed } = useFlashRow(win.id);
  const time = formatEnteredTime(win.occurred_at);
  return (
    <div
      ref={ref}
      className={cn(
        "group flex items-start gap-3 px-5 py-4 transition-colors ease-[var(--ease-register)]",
        flashed ? "bg-primary/15 duration-[var(--dur-2)]" : "duration-[var(--dur-1)]",
      )}
    >
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center">
        {category ? (
          <CategoryGlyph icon={category.icon} color={categoryColor(category)} />
        ) : (
          <PiggyBankIcon className="text-muted-foreground size-4" aria-hidden />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="truncate text-sm font-medium">{win.description}</h3>
          <Money cents={win.amount_kept} className="shrink-0 text-sm font-medium" />
        </div>
        <p className="text-muted-foreground mt-0.5 text-xs">
          {dayLabel(win.date)}
          {time ? ` · ${time}` : ""}
          {category ? ` · ${category.name}` : ""}
        </p>
        {win.reflection && (
          <p className="text-muted-foreground mt-2 text-sm">{win.reflection}</p>
        )}
        {goalName && (
          <p className="text-muted-foreground mt-2 flex items-center gap-1.5 text-xs">
            <TargetIcon className="size-3.5" aria-hidden />
            {transferLive ? `Moved to ${goalName}` : `Transfer to ${goalName} reversed`}
          </p>
        )}
      </div>
      <RowActions label={`Actions for ${win.description}`}>
        <DropdownMenuItem onSelect={onEdit}>
          <PencilIcon className="size-4" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2Icon className="size-4" />
          Delete
        </DropdownMenuItem>
      </RowActions>
    </div>
  );
}

export function CravingDeleteDialog({
  win,
  hasLiveTransfer,
  onOpenChange,
  onDelete,
}: {
  win: CravingWin;
  hasLiveTransfer: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: (reverseTransfer: boolean) => void;
}) {
  return (
    <AlertDialog open onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this win?</AlertDialogTitle>
          <AlertDialogDescription>
            {hasLiveTransfer
              ? `${formatCents(win.amount_kept)} was also moved as real money. Choose whether that transfer stays in its goal.`
              : `${formatCents(win.amount_kept)} will leave your Cravings Savings total.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          {hasLiveTransfer ? (
            <>
              <AlertDialogAction variant="outline" onClick={() => onDelete(false)}>
                Delete win only
              </AlertDialogAction>
              <AlertDialogAction variant="destructive" onClick={() => onDelete(true)}>
                Delete and move back
              </AlertDialogAction>
            </>
          ) : (
            <AlertDialogAction variant="destructive" onClick={() => onDelete(false)}>
              Delete win
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
