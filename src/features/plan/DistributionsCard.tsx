"use client";

import { useMemo, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { toast } from "sonner";
import { PlusIcon, SparklesIcon, StarIcon, XIcon } from "lucide-react";
import { setDefaultDistribution, setDistributionPreset } from "@/core/commands";
import {
  fillFromGoalAsks,
  presetIssues,
  recurringOverlap,
} from "@/core/engine/distribution";
import type { PlanAsk } from "@/core/engine/plan";
import { formatCents, parseDollars } from "@/core/money";
import {
  BPS_WHOLE,
  GENERAL_CONTAINER_ID,
  restBps,
  type Container,
  type DistributionPreset,
  type Goal,
} from "@/core/model";
import { sortContainersAlphabetically } from "@/core/engine/usage-ranking";
import {
  containersAtom,
  defaultDistributionIdAtom,
  dispatchManyAtom,
  distributionPresetsAtom,
  flashRowAtom,
  goalsAtom,
  recurringRulesAtom,
} from "@/features/store";
import { formatBps } from "@/features/distribution/format";
import { SplitBreakdown } from "@/features/distribution/SplitBreakdown";
import {
  draftFromPreset,
  emptyDraft,
  evaluateDraft,
  type PresetDraft,
} from "@/features/plan/distribution-draft";
import {
  CollapsibleSection,
  Eyebrow,
  Marginalia,
  Money,
  ResponsiveSheet,
  useFlashRow,
} from "@/features/ui";
import { InlineError } from "@/features/ui/InlineError";
import { activateCardOnClick } from "@/features/ui/card-interaction";
import { cn } from "@/lib/utils";
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

/**
 * The Plan's second card (plans/income-distribution.md): named presets that
 * split an income across containers. The allocation card above says what each
 * dollar is FOR; this says where each paycheck should LAND, once, so logging it
 * doesn't take three transfers.
 */
export function DistributionsCard({
  expectedIncome,
  goalAsks,
}: {
  /** This month's expected income — the default preview amount. */
  expectedIncome: number;
  goalAsks: PlanAsk[];
}) {
  const presets = useAtomValue(distributionPresetsAtom);
  const defaultId = useAtomValue(defaultDistributionIdAtom);
  const containers = useAtomValue(containersAtom);
  const dispatchMany = useSetAtom(dispatchManyAtom);
  const flashRow = useSetAtom(flashRowAtom);
  // null = closed, "new" = create, a preset = edit.
  const [sheet, setSheet] = useState<DistributionPreset | "new" | null>(null);

  const active = presets.filter((p) => !p.archived);
  const archived = presets.filter((p) => p.archived);

  async function archive(preset: DistributionPreset) {
    const wasDefault = preset.id === defaultId;
    const ops = [setDistributionPreset({ ...preset, archived: true })];
    if (wasDefault) ops.push(setDefaultDistribution(null));
    await dispatchMany(ops);
    setSheet(null);
    toast.success("Distribution archived", {
      description: preset.name,
      action: {
        label: "Undo",
        onClick: () => void restore(preset, wasDefault),
      },
    });
  }

  async function restore(preset: DistributionPreset, makeDefault = false) {
    const ops = [setDistributionPreset({ ...preset, archived: false })];
    if (makeDefault) ops.push(setDefaultDistribution(preset.id));
    await dispatchMany(ops);
    flashRow({ id: preset.id });
  }

  return (
    <section
      className="bg-card overflow-hidden rounded-2xl border"
      aria-labelledby="distributions-title"
    >
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-2">
        <Eyebrow as="h2" id="distributions-title">
          Distributions
        </Eyebrow>
        <Button
          size="sm"
          variant="ghost"
          className="rounded-full"
          onClick={() => setSheet("new")}
        >
          <PlusIcon className="size-4" />
          New
        </Button>
      </div>

      {active.length === 0 ? (
        <div className="px-5 pb-5">
          <Marginalia>
            split each paycheck across containers — set the shares once, then tick
            Distribute when you log income
          </Marginalia>
        </div>
      ) : (
        <div className="pb-2">
          {active.map((preset) => (
            <PresetRow
              key={preset.id}
              preset={preset}
              isDefault={preset.id === defaultId}
              containers={containers}
              onEdit={() => setSheet(preset)}
            />
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <div className="border-t px-4 py-2">
          <CollapsibleSection
            title="Archived"
            count={archived.length}
            note="Archived distributions stop being offered. Entries they already split keep their split."
          >
            <ul className="space-y-1">
              {archived.map((preset) => (
                <li
                  key={preset.id}
                  className="flex items-center justify-between gap-3 px-1"
                >
                  <span className="text-muted-foreground truncate text-sm">
                    {preset.name}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="rounded-full"
                    onClick={() => void restore(preset)}
                  >
                    Restore
                  </Button>
                </li>
              ))}
            </ul>
          </CollapsibleSection>
        </div>
      )}

      <DistributionSheet
        sheet={sheet}
        presets={presets}
        defaultId={defaultId}
        containers={containers}
        expectedIncome={expectedIncome}
        goalAsks={goalAsks}
        onOpenChange={(open) => !open && setSheet(null)}
        onSaved={(preset) => {
          setSheet(null);
          flashRow({ id: preset.id });
        }}
        onArchive={archive}
      />
    </section>
  );
}

/** A thin bar of the shares: iris steps for the parts, muted for the rest. */
function ShareBar({
  preset,
  className,
}: {
  preset: DistributionPreset;
  className?: string;
}) {
  const steps = ["bg-primary", "bg-primary/70", "bg-primary/45", "bg-primary/25"];
  return (
    <div
      className={cn("bg-muted flex h-1.5 w-full overflow-hidden rounded-full", className)}
      aria-hidden
    >
      {preset.parts.map((part, i) => (
        <span
          key={part.container_id}
          className={cn(
            "h-full",
            steps[i % steps.length],
            i > 0 && "border-card border-l",
          )}
          style={{ width: `${(part.bps / BPS_WHOLE) * 100}%` }}
        />
      ))}
    </div>
  );
}

function PresetRow({
  preset,
  isDefault,
  containers,
  onEdit,
}: {
  preset: DistributionPreset;
  isDefault: boolean;
  containers: Container[];
  onEdit: () => void;
}) {
  const { ref, flashed } = useFlashRow(preset.id);
  const issues = presetIssues(preset, containers);
  const nameOf = (id: string) => containers.find((c) => c.id === id)?.name ?? "Unknown";
  const summary = [
    ...preset.parts.map((p) => `${nameOf(p.container_id)} ${formatBps(p.bps)}`),
    `${nameOf(preset.rest_container_id)} ${formatBps(restBps(preset))} rest`,
  ].join(" · ");

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      aria-label={`Edit ${preset.name}`}
      onClick={(event) => activateCardOnClick(event, onEdit)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onEdit();
        }
      }}
      className={cn(
        "focus-visible:ring-ring block cursor-pointer px-5 py-3 transition-colors ease-[var(--ease-register)] focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset",
        flashed
          ? "bg-primary/15 duration-[var(--dur-2)]"
          : "hover:bg-muted/40 duration-[var(--dur-1)]",
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
          <span className="truncate">{preset.name}</span>
          {isDefault && (
            <span className="text-primary inline-flex shrink-0 items-center gap-0.5 text-[10px] font-normal tracking-wide uppercase">
              <StarIcon className="size-3 fill-current" aria-hidden />
              default
            </span>
          )}
        </span>
        <span className="text-muted-foreground shrink-0 text-xs">
          {preset.parts.length + 1} containers
        </span>
      </div>
      <ShareBar preset={preset} className="mt-2" />
      <p className="text-muted-foreground mt-1.5 truncate text-xs">{summary}</p>
      {issues.restUnavailable ? (
        <p className="text-destructive mt-1 text-xs">
          {nameOf(preset.rest_container_id)} is archived — this can&apos;t split until you
          pick a new rest.
        </p>
      ) : issues.foldedParts.length > 0 ? (
        <p className="mt-1 text-xs text-amber-600 dark:text-amber-500">
          {issues.foldedParts.map(nameOf).join(", ")} archived → rest
        </p>
      ) : null}
    </div>
  );
}

function DistributionSheet({
  sheet,
  presets,
  defaultId,
  containers,
  expectedIncome,
  goalAsks,
  onOpenChange,
  onSaved,
  onArchive,
}: {
  sheet: DistributionPreset | "new" | null;
  presets: DistributionPreset[];
  defaultId: string | null;
  containers: Container[];
  expectedIncome: number;
  goalAsks: PlanAsk[];
  onOpenChange: (open: boolean) => void;
  onSaved: (preset: DistributionPreset) => void;
  onArchive: (preset: DistributionPreset) => Promise<void>;
}) {
  const editing = sheet !== null && sheet !== "new" ? sheet : null;
  return (
    <ResponsiveSheet
      open={sheet !== null}
      onOpenChange={onOpenChange}
      title={editing ? "Edit distribution" : "New distribution"}
      description="Shares of each income, by container. Whatever the shares leave — and every rounding cent — goes to the rest."
    >
      {sheet !== null && (
        <DistributionForm
          key={editing?.id ?? "new"}
          editing={editing}
          presets={presets}
          defaultId={defaultId}
          containers={containers}
          expectedIncome={expectedIncome}
          goalAsks={goalAsks}
          onSaved={onSaved}
          onArchive={onArchive}
        />
      )}
    </ResponsiveSheet>
  );
}

function DistributionForm({
  editing,
  presets,
  defaultId,
  containers,
  expectedIncome,
  goalAsks,
  onSaved,
  onArchive,
}: {
  editing: DistributionPreset | null;
  presets: DistributionPreset[];
  defaultId: string | null;
  containers: Container[];
  expectedIncome: number;
  goalAsks: PlanAsk[];
  onSaved: (preset: DistributionPreset) => void;
  onArchive: (preset: DistributionPreset) => Promise<void>;
}) {
  const dispatchMany = useSetAtom(dispatchManyAtom);
  const goals = useAtomValue(goalsAtom);
  const rules = useAtomValue(recurringRulesAtom);
  const activeContainers = useMemo(
    () => sortContainersAlphabetically(containers.filter((c) => !c.is_archived)),
    [containers],
  );
  const [draft, setDraft] = useState<PresetDraft>(() =>
    editing
      ? draftFromPreset(editing, editing.id === defaultId)
      : {
          ...emptyDraft(
            activeContainers.find((c) => c.id === GENERAL_CONTAINER_ID)?.id ??
              activeContainers[0]?.id ??
              GENERAL_CONTAINER_ID,
          ),
          // The first preset you make is the one compose should reach for.
          isDefault: presets.every((p) => p.archived),
        },
  );
  const [previewStr, setPreviewStr] = useState(
    expectedIncome > 0 ? (expectedIncome / 100).toFixed(2) : "",
  );
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  let previewCents = 0;
  try {
    previewCents = Math.max(0, parseDollars(previewStr));
  } catch {
    previewCents = 0;
  }

  const evaluation = evaluateDraft(draft, {
    presets,
    editingId: editing?.id ?? null,
    containers,
    previewCents,
  });
  const nameOf = (id: string) => containers.find((c) => c.id === id)?.name ?? "Unknown";
  const used = new Set([draft.restId, ...draft.parts.map((p) => p.containerId)]);
  const addable = activeContainers.filter((c) => !used.has(c.id));
  const overlap = recurringOverlap(
    rules,
    draft.parts.map((p) => p.containerId),
  );
  const goalAskTargets = goalAsksByContainer(goalAsks, goals);

  function setPart(containerId: string, pct: string) {
    setDraft((d) => ({
      ...d,
      parts: d.parts.map((p) => (p.containerId === containerId ? { ...p, pct } : p)),
    }));
  }

  function fillFromAsks() {
    setError("");
    const result = fillFromGoalAsks({
      income: previewCents,
      restContainerId: draft.restId,
      asks: goalAskTargets,
    });
    if (!result.ok) {
      return setError(
        result.reason === "no-income"
          ? "Enter an amount to fill from — goal asks become a share of it."
          : "Your goal asks add up to more than that amount.",
      );
    }
    setDraft((d) => ({
      ...d,
      parts: result.parts.map((p) => ({
        containerId: p.container_id,
        pct: formatBps(p.bps).replace(/%$/, ""),
      })),
    }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setError("");
    const preset = evaluation.preset;
    if (!preset) return;
    const ops = [setDistributionPreset(preset)];
    const wasDefault = editing !== null && editing.id === defaultId;
    if (draft.isDefault && !wasDefault) ops.push(setDefaultDistribution(preset.id));
    if (!draft.isDefault && wasDefault) ops.push(setDefaultDistribution(null));
    try {
      await dispatchMany(ops);
    } catch {
      return;
    }
    onSaved(preset);
  }

  const showErrors = submitted;
  const restPct = formatBps(evaluation.restBps);
  const restLine = evaluation.preview?.lines.find((l) => l.rest);

  return (
    <form onSubmit={save} className="flex min-h-0 flex-1 flex-col" noValidate>
      <div className="grid gap-4 px-4">
        {error && <InlineError id="distribution-error">{error}</InlineError>}

        <div className="grid gap-1.5">
          <Label htmlFor="dist-name">Name</Label>
          <Input
            id="dist-name"
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="e.g. Paycheck"
            aria-invalid={showErrors && evaluation.errors.name ? "true" : undefined}
          />
          {showErrors && evaluation.errors.name && (
            <InlineError id="dist-name-error">{evaluation.errors.name}</InlineError>
          )}
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox
            checked={draft.isDefault}
            onCheckedChange={(v) => setDraft((d) => ({ ...d, isDefault: v === true }))}
            aria-label="Use by default"
          />
          Use by default for income with no history
        </label>

        <div className="grid gap-1.5">
          <Label htmlFor="dist-preview">Preview on</Label>
          <Input
            id="dist-preview"
            value={previewStr}
            onChange={(e) => setPreviewStr(e.target.value)}
            placeholder="0.00"
            inputMode="decimal"
            className="tnum font-mono"
          />
          {expectedIncome > 0 && (
            <p className="text-muted-foreground text-xs">
              This month&apos;s expected income is {formatCents(expectedIncome)}.
            </p>
          )}
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-2">
            <Eyebrow as="h3">Shares</Eyebrow>
            {goalAskTargets.length > 0 && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 rounded-full text-xs"
                onClick={fillFromAsks}
              >
                <SparklesIcon className="size-3.5" />
                Fill from goal asks
              </Button>
            )}
          </div>

          {draft.parts.length === 0 && (
            <p className="text-muted-foreground text-xs">
              No shares yet — everything goes to the rest. Add a container below.
            </p>
          )}
          <ul className="grid gap-2">
            {draft.parts.map((part) => {
              const bps = evaluation.partBps[part.containerId] ?? 0;
              const amount =
                evaluation.preview?.lines.find(
                  (l) => !l.rest && l.containerId === part.containerId,
                )?.amount ?? null;
              const err = showErrors
                ? evaluation.errors.parts[part.containerId]
                : undefined;
              const feeds = overlap.get(part.containerId);
              return (
                <li key={part.containerId} className="grid gap-1">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {nameOf(part.containerId)}
                    </span>
                    <div className="relative w-24 shrink-0">
                      <Input
                        value={part.pct}
                        onChange={(e) => setPart(part.containerId, e.target.value)}
                        inputMode="decimal"
                        aria-label={`${nameOf(part.containerId)} share`}
                        aria-invalid={err ? "true" : undefined}
                        className="tnum h-8 pr-6 text-right font-mono"
                        placeholder="0"
                      />
                      <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs">
                        %
                      </span>
                    </div>
                    <span className="w-24 shrink-0 text-right">
                      {amount !== null ? (
                        <Money cents={amount} tone="quiet" className="text-xs" />
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          {bps > 0 ? "—" : ""}
                        </span>
                      )}
                    </span>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="text-muted-foreground size-7 shrink-0 rounded-lg"
                      aria-label={`Remove ${nameOf(part.containerId)}`}
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          parts: d.parts.filter(
                            (p) => p.containerId !== part.containerId,
                          ),
                        }))
                      }
                    >
                      <XIcon className="size-3.5" />
                    </Button>
                  </div>
                  {err && (
                    <InlineError id={`dist-part-${part.containerId}`}>{err}</InlineError>
                  )}
                  {feeds && (
                    <p className="text-muted-foreground text-xs">
                      Also gets{" "}
                      {feeds
                        .map(
                          (r) =>
                            `${formatCents(Math.abs(r.template_amount ?? 0))} from “${r.template_vendor_source}”`,
                        )
                        .join(", ")}{" "}
                      on a schedule.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>

          {addable.length > 0 && (
            <Select
              value=""
              onValueChange={(id) =>
                setDraft((d) => ({
                  ...d,
                  parts: [...d.parts, { containerId: id, pct: "" }],
                }))
              }
            >
              <SelectTrigger
                aria-label="Add a container"
                className="h-8 w-fit gap-1.5 text-xs"
              >
                <PlusIcon className="size-3.5" />
                <SelectValue placeholder="Add container" />
              </SelectTrigger>
              <SelectContent>
                {addable.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <div className="bg-surface-sunken/60 mt-1 grid gap-1 rounded-lg border p-2">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground shrink-0 text-xs">Rest →</span>
              <Select
                value={draft.restId}
                onValueChange={(restId) =>
                  setDraft((d) => ({
                    ...d,
                    restId,
                    parts: d.parts.filter((p) => p.containerId !== restId),
                  }))
                }
              >
                <SelectTrigger aria-label="Rest container" className="h-8 min-w-0 flex-1">
                  <SelectValue>{nameOf(draft.restId)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {activeContainers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span
                className="text-muted-foreground tnum w-14 shrink-0 text-right font-mono text-xs"
                data-testid="rest-share"
              >
                {restPct}
              </span>
              <span className="w-24 shrink-0 text-right">
                {restLine && <Money cents={restLine.amount} className="text-xs" />}
              </span>
            </div>
            <p className="text-muted-foreground text-xs">
              Takes what the shares leave, plus every rounding cent.
            </p>
            {evaluation.errors.rest && (
              <InlineError id="dist-rest-error">{evaluation.errors.rest}</InlineError>
            )}
          </div>

          {evaluation.errors.total && (
            <InlineError id="dist-total-error">{evaluation.errors.total}</InlineError>
          )}
          {evaluation.warnings.map((w) => (
            <p key={w} className="text-xs text-amber-600 dark:text-amber-500">
              {w}
            </p>
          ))}
        </div>

        {evaluation.preview && (
          <div className="grid gap-1.5">
            <Eyebrow as="h3">Preview</Eyebrow>
            <SplitBreakdown
              lines={evaluation.preview.lines}
              total={evaluation.preview.total}
              className="rounded-lg border p-1.5"
            />
          </div>
        )}
      </div>

      <SheetFooter className="mt-auto flex-row items-center gap-2">
        {editing && (
          <Button
            type="button"
            variant="ghost"
            className="text-muted-foreground hover:text-destructive mr-auto"
            onClick={() => void onArchive(editing)}
          >
            Archive
          </Button>
        )}
        <Button
          type="submit"
          className={cn(!editing && "ml-auto")}
          disabled={Boolean(evaluation.errors.total)}
        >
          Save
        </Button>
      </SheetFooter>
    </form>
  );
}

/** This month's goal asks, keyed to the container each goal fills. */
function goalAsksByContainer(asks: PlanAsk[], goals: Goal[]) {
  return asks.flatMap((ask) => {
    const goal = goals.find((g) => g.id === ask.goalId);
    return goal && ask.amount > 0
      ? [{ containerId: goal.container_id, amount: ask.amount }]
      : [];
  });
}
