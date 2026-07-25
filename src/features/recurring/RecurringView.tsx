"use client";

import { useMemo, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { toast } from "sonner";
import {
  ArrowRightIcon,
  PencilIcon,
  PlusIcon,
  RepeatIcon,
  RotateCcwIcon,
  XIcon,
} from "lucide-react";
import {
  cancelRecurringRule,
  createRecurringRule,
  uncancelRecurringRule,
  updateRecurringRule,
} from "@/core/commands";
import {
  isTransferRule,
  makeRecurringRule,
  type Category,
  type Container,
  type Frequency,
  type IntervalConfig,
  type RecurringRule,
  type RuleStatus,
} from "@/core/model";
import { firstOccurrenceOnOrAfter } from "@/core/engine/recurring";
import {
  categoriesAtom,
  containersAtom,
  dispatchAtom,
  flashRowAtom,
  flashedRowAtom,
  readyAtom,
  recurringRulesAtom,
  runRecurringGenerationAtom,
} from "@/features/store";
import { describeRule } from "@/features/recurring/describe";
import { RecurringRuleSheet } from "@/features/recurring/RecurringRuleSheet";
import {
  activeRuleFilterCount,
  applyRuleFilter,
  isRuleSort,
  sortRules,
  type RuleFilter,
  type RuleKind,
} from "@/features/recurring/filter";
import { useLocalPref } from "@/features/prefs";
import { FilterBar } from "@/features/FilterBar";
import { categoryColor, categoryColorFor } from "@/features/category-color";
import { CategoryGlyph } from "@/features/category-icons";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { todayIso } from "@/features/clock";
import {
  CollapsibleSection,
  EmptyState,
  ListSkeleton,
  Money,
  PageHeader,
  PageHeaderSkeleton,
  RowActions,
} from "@/features/ui";

/** Device-local: how you like to READ your rules, not a fact about them. */
const SORT_KEY = "yaccount.recurring.sort";

const SORT_OPTIONS = [
  { value: "next", label: "Next due" },
  { value: "name", label: "Name" },
  { value: "amount", label: "Amount" },
] as const;

const STATUSES: { value: RuleStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "cancelled", label: "Paused" },
];

const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Twice a month" },
  { value: "monthly", label: "Monthly" },
  { value: "annually", label: "Annually" },
  { value: "custom", label: "Custom" },
];

const KINDS: { value: RuleKind; label: string }[] = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfer" },
];

interface RuleDraft {
  text: string;
  statuses: RuleStatus[];
  frequencies: Frequency[];
  kinds: RuleKind[];
}

const NO_FILTER: RuleDraft = { text: "", statuses: [], frequencies: [], kinds: [] };

export function RecurringView() {
  const ready = useAtomValue(readyAtom);
  const rules = useAtomValue(recurringRulesAtom);
  const categories = useAtomValue(categoriesAtom);
  const containers = useAtomValue(containersAtom);
  const dispatch = useSetAtom(dispatchAtom);
  const flashRow = useSetAtom(flashRowAtom);
  const generate = useSetAtom(runRecurringGenerationAtom);

  // `null` = sheet closed; `"new"` = create; a rule = edit.
  const [sheet, setSheet] = useState<RecurringRule | "new" | null>(null);

  // Sort is remembered; the filters are deliberately not (§12.4 M11).
  const [sort, setSort] = useLocalPref(SORT_KEY, "next", isRuleSort);
  const [draft, setDraft] = useState<RuleDraft>(NO_FILTER);
  const filter: RuleFilter = draft;
  const filtering = activeRuleFilterCount(filter) > 0;

  const catName = useMemo(() => {
    const m = new Map(categories.map((c) => [c.id, c.name]));
    return (id: string | null) => (id ? (m.get(id) ?? "Unknown") : null);
  }, [categories]);
  const contName = useMemo(() => {
    const m = new Map(containers.map((c) => [c.id, c.name]));
    return (id: string | null) => (id ? (m.get(id) ?? "Unknown") : "");
  }, [containers]);
  const glyphOf = useMemo(() => {
    const m = new Map(categories.map((c) => [c.id, c]));
    return (id: string | null): { color: string | undefined; icon: string | null } => {
      if (!id) return { color: undefined, icon: null };
      const c = m.get(id);
      return c
        ? { color: categoryColor(c), icon: c.icon }
        : { color: categoryColorFor(id, categories), icon: null };
    };
  }, [categories]);

  // What else a rule can be found by: the category and wallets it writes through.
  const labelOf = useMemo(
    () => (r: RecurringRule) =>
      `${catName(r.template_category_id) ?? ""} ${contName(r.template_container_id)} ${contName(r.template_to_container_id)}`,
    [catName, contName],
  );

  const shown = useMemo(
    () =>
      sortRules(applyRuleFilter(rules, filter, { label: labelOf }), sort, {
        label: (r) => r.template_vendor_source,
      }),
    [rules, filter, labelOf, sort],
  );

  const active = useMemo(() => shown.filter((r) => r.status === "active"), [shown]);
  const cancelled = useMemo(() => shown.filter((r) => r.status === "cancelled"), [shown]);

  if (!ready)
    return (
      <div className="space-y-6">
        <PageHeaderSkeleton />
        <div className="bg-card overflow-hidden rounded-2xl border">
          <ListSkeleton rows={4} />
        </div>
      </div>
    );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Recurring"
        title="Scheduled transactions"
        action={
          <Button className="rounded-full" onClick={() => setSheet("new")}>
            <PlusIcon className="size-4" />
            New
          </Button>
        }
      >
        Each rule drops one transaction into your inbox as it comes due — you always
        approve before anything is logged.
      </PageHeader>

      {rules.length > 0 && (
        <FilterBar
          search={draft.text}
          onSearch={(text) => setDraft((d) => ({ ...d, text }))}
          searchPlaceholder="Search rules"
          facets={[
            {
              id: "status",
              label: "Status",
              selected: draft.statuses,
              onChange: (statuses) =>
                setDraft((d) => ({ ...d, statuses: statuses as RuleStatus[] })),
              options: STATUSES,
            },
            {
              id: "frequency",
              label: "Frequency",
              selected: draft.frequencies,
              onChange: (frequencies) =>
                setDraft((d) => ({ ...d, frequencies: frequencies as Frequency[] })),
              options: FREQUENCIES,
            },
            {
              id: "kind",
              label: "Type",
              selected: draft.kinds,
              onChange: (kinds) =>
                setDraft((d) => ({ ...d, kinds: kinds as RuleKind[] })),
              options: KINDS,
            },
          ]}
          sort={{ value: sort, options: [...SORT_OPTIONS], onChange: setSort }}
          activeCount={activeRuleFilterCount(filter)}
          onClear={() => setDraft(NO_FILTER)}
        />
      )}

      <div className="bg-card overflow-hidden rounded-2xl border">
        {shown.length === 0 ? (
          filtering && rules.length > 0 ? (
            <EmptyState
              title="Nothing matches those filters"
              action={
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={() => setDraft(NO_FILTER)}
                >
                  Clear filters
                </Button>
              }
            >
              {rules.length} rule{rules.length === 1 ? "" : "s"} — widen the filters to
              see them.
            </EmptyState>
          ) : (
            <EmptyState
              icon={RepeatIcon}
              title="Nothing scheduled yet"
              action={
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={() => setSheet("new")}
                >
                  <PlusIcon className="size-4" />
                  New rule
                </Button>
              }
            >
              Add a rule to automate a bill, a paycheck or a savings transfer. Each one
              still asks before it logs anything.
            </EmptyState>
          )
        ) : active.length === 0 ? (
          <EmptyState title="Nothing active">
            Every rule that matches is paused — resume one below to schedule it again.
          </EmptyState>
        ) : (
          active.map((r, i) => (
            <RuleRow
              key={r.id}
              rule={r}
              glyph={glyphOf(r.template_category_id)}
              categoryName={catName(r.template_category_id)}
              containerName={contName(r.template_container_id)}
              toContainerName={contName(r.template_to_container_id)}
              divider={i > 0}
              onEdit={() => setSheet(r)}
              onCancel={async () => {
                await dispatch(cancelRecurringRule(r.id));
                toast.success("Recurring paused", {
                  description: r.template_vendor_source,
                  action: {
                    label: "Undo",
                    onClick: () => void dispatch(uncancelRecurringRule(r.id)),
                  },
                });
              }}
            />
          ))
        )}
      </div>

      {/* Folded away by default (§12.4 M11 responsive density): a paused rule
          generates nothing, so it is never the reason you opened this screen —
          but its count stays on screen, because Resume is the visible inverse of
          Pause (§1.1). */}
      <CollapsibleSection
        title="Paused"
        count={cancelled.length}
        note="These generate nothing until you resume them. Nothing was deleted."
      >
        <div className="rounded-2xl border border-dashed">
          {cancelled.map((r, i) => (
            <div
              key={r.id}
              className={cn(
                "text-muted-foreground flex items-center gap-3 px-5 py-3",
                i > 0 && "border-t border-dashed",
              )}
            >
              <RepeatIcon className="size-4 shrink-0" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {r.template_vendor_source}
                </div>
                <div className="truncate text-xs">{describeRule(r)}</div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="shrink-0 rounded-full"
                onClick={() => dispatch(uncancelRecurringRule(r.id))}
              >
                <RotateCcwIcon className="size-4" />
                Resume
              </Button>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      <RecurringRuleSheet
        open={sheet !== null}
        rule={sheet === "new" ? null : sheet}
        categories={categories}
        containers={containers}
        onOpenChange={(open) => !open && setSheet(null)}
        onSubmit={async (input, editingId) => {
          if (editingId) {
            // Editing is forward-looking: keep the status, but RESET the cursor to
            // the next occurrence on/after today under the new schedule. Preserving
            // the old cursor could mass-backfill on a frequency change; anchoring to
            // today keeps edits predictable. Already-generated rows are independent
            // proposals — the user edits or dismisses those in the inbox.
            const prev = rules.find((r) => r.id === editingId)!;
            const draft = makeRecurringRule({
              ...input,
              id: editingId,
              status: prev.status,
            });
            const next = {
              ...draft,
              next_generation_date: firstOccurrenceOnOrAfter(draft, todayIso()),
            };
            await dispatch(updateRecurringRule(next));
            flashRow({ id: editingId });
          } else {
            const op = createRecurringRule(input);
            await dispatch(op);
            if (op.type === "recurringRule.create") {
              flashRow({ id: op.payload.row.id });
            }
          }
          setSheet(null);
          // Generate right away so due/backfilled occurrences hit the inbox now,
          // not only on the next app open (§8.6 background reconcile).
          await generate();
        }}
      />
    </div>
  );
}

function RuleRow({
  rule,
  glyph,
  categoryName,
  containerName,
  toContainerName,
  divider,
  onEdit,
  onCancel,
}: {
  rule: RecurringRule;
  /** The category's mark (icon + colour), resolved by the parent. */
  glyph: { color: string | undefined; icon: string | null };
  categoryName: string | null;
  containerName: string;
  toContainerName: string;
  divider: boolean;
  onEdit: () => void;
  onCancel: () => void;
}) {
  const flashed = useAtomValue(flashedRowAtom)?.id === rule.id;
  const transfer = isTransferRule(rule);
  const income = !transfer && (rule.template_amount ?? 0) >= 0;
  const sub = transfer
    ? [containerName || "Transfer", toContainerName].filter(Boolean).join(" → ")
    : [categoryName, containerName].filter(Boolean).join(" · ");

  return (
    <div
      className={cn(
        "group flex items-center gap-3 px-5 py-3 transition-colors ease-[var(--ease-register)]",
        flashed
          ? "bg-primary/15 duration-[var(--dur-2)]"
          : "hover:bg-muted/40 duration-[var(--dur-1)]",
        divider && "border-t",
      )}
    >
      {transfer ? (
        <span className="inline-flex size-4 shrink-0 items-center justify-center">
          <ArrowRightIcon className="text-muted-foreground size-2.5" aria-hidden />
        </span>
      ) : (
        <CategoryGlyph icon={glyph.icon} color={glyph.color} />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{rule.template_vendor_source}</div>
        <div className="text-muted-foreground truncate text-xs">
          {describeRule(rule)}
          {sub && <span> · {sub}</span>}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <Money
          cents={rule.template_amount ?? 0}
          absolute
          tone={transfer ? "quiet" : income ? "in" : "neutral"}
          className="text-sm tracking-tight"
        />
        <Badge variant="secondary" className="rounded-full text-[10px] font-normal">
          next {rule.next_generation_date.slice(5)}
        </Badge>
      </div>
      <RowActions label={`Actions for ${rule.template_vendor_source}`}>
        <DropdownMenuItem onClick={onEdit}>
          <PencilIcon className="size-4" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={onCancel}>
          <XIcon className="size-4" />
          Pause
        </DropdownMenuItem>
      </RowActions>
    </div>
  );
}

export type RuleFormInput = {
  frequency: Frequency;
  interval_config: IntervalConfig;
  template_vendor_source: string;
  template_container_id: string;
  start_date: string;
  template_amount: number | null;
  template_category_id: string | null;
  template_to_container_id: string | null;
  end_date: string | null;
};

// Re-exported so the sheet and view agree on the container/category prop types.
export type { Category, Container };
