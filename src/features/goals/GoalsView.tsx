"use client";

import { useMemo, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { toast } from "sonner";
import {
  ArchiveIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  RotateCcwIcon,
  TargetIcon,
  XIcon,
} from "lucide-react";
import {
  archiveGoal,
  cancelGoal,
  createContainer,
  createGoal,
  createRecurringRule,
  unarchiveGoal,
  uncancelGoal,
  updateGoal,
} from "@/core/commands";
import { formatCents } from "@/core/money";
import { makeGoal, newId, type Goal, type Transaction } from "@/core/model";
import { containerBalance } from "@/core/engine/balances";
import {
  goalBasis,
  goalContributed,
  goalProgress,
  isAchieved,
  projectedCompletion,
  requiredMonthly,
  requiresReplan,
} from "@/core/engine/goals";
import {
  containersAtom,
  defaultContainerIdAtom,
  dispatchAtom,
  goalsAtom,
  readyAtom,
  runRecurringGenerationAtom,
  transactionsAtom,
} from "@/features/store";
import { describeGoal } from "@/features/goals/describe";
import { GoalSheet, type GoalFormInput } from "@/features/goals/GoalSheet";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { todayIso } from "@/features/clock";

export function GoalsView() {
  const ready = useAtomValue(readyAtom);
  const goals = useAtomValue(goalsAtom);
  const containers = useAtomValue(containersAtom);
  const txns = useAtomValue(transactionsAtom);
  const defaultContainerId = useAtomValue(defaultContainerIdAtom);
  const dispatch = useSetAtom(dispatchAtom);
  const generate = useSetAtom(runRecurringGenerationAtom);

  const [sheet, setSheet] = useState<Goal | "new" | null>(null);

  const containerName = useMemo(() => {
    const m = new Map(containers.map((c) => [c.id, c.name]));
    return (id: string) => m.get(id) ?? "Unknown";
  }, [containers]);

  const active = useMemo(
    () => goals.filter((g) => g.status === "active" && !g.is_archived),
    [goals],
  );
  const done = useMemo(
    () =>
      goals.filter(
        (g) => !g.is_archived && (g.status === "completed" || g.status === "cancelled"),
      ),
    [goals],
  );
  const archived = useMemo(() => goals.filter((g) => g.is_archived), [goals]);

  async function handleSubmit(input: GoalFormInput, editing: Goal | null) {
    if (editing) {
      // Edit the goal row (entity-LWW). Container + cycle basis are fixed; the
      // factory re-validates the mode/kind cross-field rules.
      const next = makeGoal({
        id: editing.id,
        container_id: editing.container_id,
        kind: input.kind,
        mode: input.mode,
        name: input.name,
        target_amount: input.target_amount,
        deadline: input.deadline,
        planned_monthly: input.planned_monthly,
        opening_contributed: editing.opening_contributed,
        status: editing.status,
        is_archived: editing.is_archived,
        created_date: editing.created_date,
        completed_date: editing.completed_date,
      });
      await dispatch(updateGoal(next));
      toast.success("Goal updated", { description: input.name });
      setSheet(null);
      return;
    }

    // Create: auto-create or reuse the container by name (§5.9.2).
    const nameKey = input.name.trim().toLowerCase();
    const existing = containers.find(
      (c) => !c.is_archived && c.name.trim().toLowerCase() === nameKey,
    );
    if (existing && active.some((g) => g.container_id === existing.id)) {
      toast.error(`You already have an active ${existing.name} goal.`);
      return;
    }

    let containerId: string;
    if (existing) {
      containerId = existing.id;
    } else {
      containerId = newId();
      await dispatch(createContainer({ id: containerId, name: input.name }));
    }

    const opening =
      input.absorbLeftover && existing ? containerBalance(txns, existing.id) : 0;

    const goalId = newId();
    await dispatch(
      createGoal({
        id: goalId,
        container_id: containerId,
        kind: input.kind,
        mode: input.mode,
        name: input.name,
        target_amount: input.target_amount,
        deadline: input.deadline,
        planned_monthly: input.planned_monthly,
        opening_contributed: opening,
        created_date: todayIso(),
      }),
    );

    if (input.autoContribute) {
      await dispatch(
        createRecurringRule({
          frequency: "monthly",
          interval_config: { day_of_month: input.contributionDay },
          template_vendor_source: `Save toward ${input.name}`,
          template_container_id: input.fundingContainerId,
          template_category_id: null,
          template_to_container_id: containerId,
          amount_mode: input.mode === "deadline" ? "goal_derived" : "fixed",
          template_amount: input.mode === "fixed" ? input.planned_monthly : null,
          linked_goal_id: goalId,
          start_date: todayIso(),
        }),
      );
      await generate();
    }

    toast.success("Goal created", { description: input.name });
    setSheet(null);
  }

  if (!ready) return <p className="text-muted-foreground py-16 text-sm">Loading…</p>;

  return (
    <div className="space-y-6">
      <section className="flex items-end justify-between pt-3 pb-1">
        <div>
          <p className="text-muted-foreground text-xs font-medium tracking-[0.18em] uppercase">
            Goals
          </p>
          <h1 className="font-display mt-1 text-3xl leading-none">Savings goals</h1>
          <p className="text-muted-foreground mt-3 max-w-md text-sm">
            Give every pool of money a purpose and a pace. Progress tracks what you set
            aside — not what&apos;s left to spend.
          </p>
        </div>
        <Button className="rounded-full" onClick={() => setSheet("new")}>
          <PlusIcon className="size-4" />
          New
        </Button>
      </section>

      {active.length === 0 ? (
        <div className="bg-card text-muted-foreground rounded-2xl border px-5 py-14 text-center text-sm">
          No goals yet. Start one to save toward something specific.
        </div>
      ) : (
        <div className="grid gap-3">
          {active.map((g) => (
            <GoalCard
              key={g.id}
              goal={g}
              txns={txns}
              containerName={containerName(g.container_id)}
              onEdit={() => setSheet(g)}
              onCancel={async () => {
                await dispatch(cancelGoal(g.id));
                toast.success("Goal cancelled", {
                  description: "The money stays in its container.",
                  action: {
                    label: "Undo",
                    onClick: () => void dispatch(uncancelGoal(g.id)),
                  },
                });
              }}
            />
          ))}
        </div>
      )}

      {done.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-muted-foreground px-1 text-xs font-medium tracking-[0.14em] uppercase">
            Achieved &amp; closed
          </h2>
          <div className="grid gap-3">
            {done.map((g) => (
              <GoalCard
                key={g.id}
                goal={g}
                txns={txns}
                containerName={containerName(g.container_id)}
                onEdit={() => setSheet(g)}
                onArchive={async () => {
                  await dispatch(archiveGoal(g.id));
                  toast.success("Goal archived", {
                    action: {
                      label: "Undo",
                      onClick: () => void dispatch(unarchiveGoal(g.id)),
                    },
                  });
                }}
                onResume={
                  g.status === "cancelled"
                    ? async () => {
                        await dispatch(uncancelGoal(g.id));
                        toast.success("Goal resumed");
                      }
                    : undefined
                }
              />
            ))}
          </div>
        </section>
      )}

      {archived.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-muted-foreground px-1 text-xs font-medium tracking-[0.14em] uppercase">
            Archived
          </h2>
          <div className="rounded-2xl border border-dashed">
            {archived.map((g, i) => (
              <div
                key={g.id}
                className={cn(
                  "text-muted-foreground flex items-center gap-3 px-5 py-3",
                  i > 0 && "border-t border-dashed",
                )}
              >
                <TargetIcon className="size-4 shrink-0" aria-hidden />
                <div className="min-w-0 flex-1 truncate text-sm">
                  {g.name ?? containerName(g.container_id)}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-full"
                  onClick={() => dispatch(unarchiveGoal(g.id))}
                >
                  <RotateCcwIcon className="size-4" />
                  Restore
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      <GoalSheet
        open={sheet !== null}
        goal={sheet === "new" ? null : sheet}
        containers={containers}
        defaultFundingId={defaultContainerId}
        onOpenChange={(open) => !open && setSheet(null)}
        onSubmit={handleSubmit}
      />
    </div>
  );
}

function GoalCard({
  goal,
  txns,
  containerName,
  onEdit,
  onCancel,
  onArchive,
  onResume,
}: {
  goal: Goal;
  txns: Transaction[];
  containerName: string;
  onEdit: () => void;
  onCancel?: () => void;
  onArchive?: () => void;
  onResume?: () => void;
}) {
  const now = todayIso();
  const contributed = goalContributed(goal, txns);
  const basis = goalBasis(goal, txns);
  const balance = containerBalance(txns, goal.container_id);
  const progress = goalProgress(goal, txns);
  const ask = requiredMonthly(goal, txns, now);
  const achieved = isAchieved(goal, txns);
  const replan = requiresReplan(goal, txns, now);
  const projected = projectedCompletion(goal, txns, now);
  const openEnded = goal.mode === "fixed" && goal.target_amount === null;
  const pct = progress === null ? null : Math.min(100, Math.round(progress * 100));

  return (
    <div className="bg-card rounded-2xl border p-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-display truncate text-lg leading-tight">
              {goal.name ?? containerName}
            </h3>
            {goal.status === "cancelled" && (
              <Badge variant="secondary" className="rounded-full text-[10px]">
                Cancelled
              </Badge>
            )}
            {achieved && goal.status !== "cancelled" && (
              <Badge className="text-positive bg-positive/12 rounded-full border-none text-[10px]">
                Achieved
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-0.5 text-xs">{describeGoal(goal)}</p>
        </div>
        <GoalMenu
          onEdit={onEdit}
          onCancel={onCancel}
          onArchive={onArchive}
          onResume={onResume}
          name={goal.name ?? containerName}
        />
      </div>

      {openEnded ? (
        <p className="mt-4 text-sm">
          <span className="tnum font-mono">{formatCents(contributed)}</span>{" "}
          <span className="text-muted-foreground">contributed · open-ended</span>
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="tnum font-mono text-sm">
              {formatCents(basis)}
              {goal.target_amount != null && (
                <span className="text-muted-foreground">
                  {" "}
                  / {formatCents(goal.target_amount)}
                </span>
              )}
            </span>
            {pct != null && (
              <span className="text-muted-foreground tnum font-mono text-xs">
                {progress != null && progress > 1 ? Math.round(progress * 100) : pct}%
              </span>
            )}
          </div>
          {pct != null && <Progress value={pct} className="h-1.5" />}
        </div>
      )}

      <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {goal.kind === "spend_down" && (
          <span>
            <span className="tnum font-mono">{formatCents(balance)}</span> available
          </span>
        )}
        {goal.status === "active" && ask > 0 && (
          <span>
            <span className="tnum text-foreground font-mono">{formatCents(ask)}</span>/mo
            to stay on pace
          </span>
        )}
        {projected && (
          <span>
            on track for <span className="tnum font-mono">{projected.slice(0, 7)}</span>
          </span>
        )}
      </div>

      {replan && goal.status === "active" && (
        <p className="text-destructive mt-3 flex items-center gap-1.5 text-xs">
          <XIcon className="size-3.5" />
          Past the deadline and still short — push the date or lower the target.
        </p>
      )}
    </div>
  );
}

function GoalMenu({
  name,
  onEdit,
  onCancel,
  onArchive,
  onResume,
}: {
  name: string;
  onEdit: () => void;
  onCancel?: () => void;
  onArchive?: () => void;
  onResume?: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground size-8 shrink-0 rounded-lg"
          aria-label={`Actions for ${name}`}
        >
          <MoreHorizontalIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onEdit}>
          <PencilIcon className="size-4" />
          Edit
        </DropdownMenuItem>
        {onResume && (
          <DropdownMenuItem onClick={onResume}>
            <RotateCcwIcon className="size-4" />
            Resume
          </DropdownMenuItem>
        )}
        {onArchive && (
          <DropdownMenuItem onClick={onArchive}>
            <ArchiveIcon className="size-4" />
            Archive
          </DropdownMenuItem>
        )}
        {onCancel && (
          <DropdownMenuItem variant="destructive" onClick={onCancel}>
            <XIcon className="size-4" />
            Cancel goal
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
