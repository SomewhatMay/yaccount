"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { parseDollars } from "@/core/money";
import type { Container, Goal, GoalKind, GoalMode } from "@/core/model";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const today = (): string => new Date().toISOString().slice(0, 10);

export interface GoalFormInput {
  name: string;
  kind: GoalKind;
  mode: GoalMode;
  target_amount: number | null;
  deadline: string | null;
  planned_monthly: number | null;
  absorbLeftover: boolean;
  autoContribute: boolean;
  fundingContainerId: string;
  contributionDay: number;
}

const dollars = (cents: number | null): string =>
  cents != null ? (cents / 100).toFixed(2) : "";

export function GoalSheet({
  open,
  goal,
  containers,
  defaultFundingId,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  goal: Goal | null; // null = create
  containers: Container[];
  defaultFundingId: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: GoalFormInput, editingGoal: Goal | null) => Promise<void>;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-display text-xl">
            {goal ? "Edit goal" : "New savings goal"}
          </SheetTitle>
          <SheetDescription>
            A goal gives a pool of money a purpose and a pace. Contributions are transfers
            into its container — you always approve them.
          </SheetDescription>
        </SheetHeader>
        {open && (
          <GoalForm
            key={goal?.id ?? "new"}
            goal={goal}
            containers={containers}
            defaultFundingId={defaultFundingId}
            onSubmit={onSubmit}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function GoalForm({
  goal,
  containers,
  defaultFundingId,
  onSubmit,
}: {
  goal: Goal | null;
  containers: Container[];
  defaultFundingId: string;
  onSubmit: (input: GoalFormInput, editingGoal: Goal | null) => Promise<void>;
}) {
  const containerName = useMemo(() => {
    const m = new Map(containers.map((c) => [c.id, c.name]));
    return (id: string) => m.get(id) ?? "";
  }, [containers]);

  const [name, setName] = useState(
    goal ? (goal.name ?? containerName(goal.container_id)) : "",
  );
  const [kind, setKind] = useState<GoalKind>(goal?.kind ?? "spend_down");
  const [mode, setMode] = useState<GoalMode>(goal?.mode ?? "deadline");
  const [targetStr, setTargetStr] = useState(dollars(goal?.target_amount ?? null));
  const [deadline, setDeadline] = useState(goal?.deadline ?? "");
  const [monthlyStr, setMonthlyStr] = useState(dollars(goal?.planned_monthly ?? null));

  const [absorb, setAbsorb] = useState(true);
  const [auto, setAuto] = useState(false);
  const [fundingId, setFundingId] = useState(defaultFundingId);
  const [contribDay, setContribDay] = useState("1");

  const activeContainers = useMemo(
    () => containers.filter((c) => !c.is_archived),
    [containers],
  );

  const targetRequired = mode === "deadline" || kind === "reserve";
  const showMonthly = mode === "fixed";
  const showDeadline = mode === "deadline";
  const canAuto = mode !== "passive";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Name your goal.");

    let target: number | null = null;
    if (targetStr.trim()) {
      try {
        target = parseDollars(targetStr);
      } catch {
        return toast.error("Enter a valid target amount.");
      }
    }
    if (targetRequired && (target === null || target === 0)) {
      return toast.error("This goal needs a target amount.");
    }
    if (showDeadline && !deadline) return toast.error("Pick a deadline date.");

    let monthly: number | null = null;
    if (showMonthly) {
      try {
        monthly = parseDollars(monthlyStr);
      } catch {
        return toast.error("Enter a valid monthly amount.");
      }
      if (monthly === 0) return toast.error("Set a monthly contribution.");
    }

    const day = Number(contribDay);
    if (auto && canAuto && (!Number.isInteger(day) || day < 1 || day > 31)) {
      return toast.error("Contribution day must be 1–31.");
    }

    try {
      await onSubmit(
        {
          name: name.trim(),
          kind,
          mode,
          target_amount: target,
          deadline: showDeadline ? deadline : null,
          planned_monthly: showMonthly ? monthly : null,
          absorbLeftover: absorb,
          autoContribute: auto && canAuto,
          fundingContainerId: fundingId,
          contributionDay: day,
        },
        goal,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save the goal.");
    }
  }

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <div className="grid gap-4 px-4">
        <div className="grid gap-1.5">
          <Label htmlFor="g-name">Goal name</Label>
          <Input
            id="g-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Winter clothes"
          />
          {!goal && (
            <p className="text-muted-foreground text-xs">
              Creates a container by this name, or reuses one if it already exists.
            </p>
          )}
        </div>

        <div className="grid gap-1.5">
          <Label>Kind</Label>
          <ToggleGroup
            type="single"
            value={kind}
            onValueChange={(v) => v && setKind(v as GoalKind)}
            className="bg-muted/50 w-fit rounded-full p-0.5"
          >
            <ToggleGroupItem
              value="spend_down"
              className="data-[state=on]:bg-background h-7 rounded-full px-3 text-xs"
            >
              Save &amp; spend
            </ToggleGroupItem>
            <ToggleGroupItem
              value="reserve"
              className="data-[state=on]:bg-background h-7 rounded-full px-3 text-xs"
            >
              Keep as reserve
            </ToggleGroupItem>
          </ToggleGroup>
          <p className="text-muted-foreground text-xs">
            {kind === "reserve"
              ? "Progress follows the live balance — spending re-opens the goal (e.g. emergency fund)."
              : "Progress tracks what you set aside — spending on its purpose keeps it complete."}
          </p>
        </div>

        <div className="grid gap-1.5">
          <Label>Plan</Label>
          <Select value={mode} onValueChange={(v) => setMode(v as GoalMode)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="deadline">By a deadline</SelectItem>
              <SelectItem value="fixed">Fixed monthly amount</SelectItem>
              <SelectItem value="passive">Passive (no plan)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="g-target">Target {targetRequired ? "" : "(optional)"}</Label>
          <Input
            id="g-target"
            value={targetStr}
            onChange={(e) => setTargetStr(e.target.value)}
            placeholder="0.00"
            inputMode="decimal"
            className="tnum font-mono"
          />
        </div>

        {showDeadline && (
          <div className="grid gap-1.5">
            <Label htmlFor="g-deadline">Deadline</Label>
            <Input
              id="g-deadline"
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </div>
        )}

        {showMonthly && (
          <div className="grid gap-1.5">
            <Label htmlFor="g-monthly">Monthly contribution</Label>
            <Input
              id="g-monthly"
              value={monthlyStr}
              onChange={(e) => setMonthlyStr(e.target.value)}
              placeholder="0.00"
              inputMode="decimal"
              className="tnum font-mono"
            />
          </div>
        )}

        {!goal && (
          <>
            <label className="flex items-start gap-2.5 text-sm">
              <Checkbox
                checked={absorb}
                onCheckedChange={(v) => setAbsorb(v === true)}
                className="mt-0.5"
              />
              <span>
                Absorb any leftover balance as a head-start
                <span className="text-muted-foreground block text-xs">
                  If the container already holds money, count it toward this goal.
                </span>
              </span>
            </label>

            {canAuto && (
              <label className="flex items-start gap-2.5 text-sm">
                <Checkbox
                  checked={auto}
                  onCheckedChange={(v) => setAuto(v === true)}
                  className="mt-0.5"
                />
                <span>
                  Auto-contribute monthly
                  <span className="text-muted-foreground block text-xs">
                    Drops a pending transfer into your inbox each month —
                    {mode === "deadline"
                      ? " the amount tracks the required pace."
                      : " the fixed amount above."}
                  </span>
                </span>
              </label>
            )}

            {auto && canAuto && (
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>From</Label>
                  <Select value={fundingId} onValueChange={setFundingId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {activeContainers.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="g-day">Day of month</Label>
                  <Input
                    id="g-day"
                    type="number"
                    min={1}
                    max={31}
                    value={contribDay}
                    onChange={(e) => setContribDay(e.target.value)}
                    className="tnum font-mono"
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <SheetFooter className="mt-auto">
        <Button type="submit">{goal ? "Save changes" : "Create goal"}</Button>
      </SheetFooter>
    </form>
  );
}
