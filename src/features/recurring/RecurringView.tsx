"use client";

import { useMemo, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { toast } from "sonner";
import {
  ArrowRightIcon,
  MoreHorizontalIcon,
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
import { formatCents } from "@/core/money";
import {
  isTransferRule,
  makeRecurringRule,
  type Category,
  type Container,
  type Frequency,
  type IntervalConfig,
  type RecurringRule,
} from "@/core/model";
import {
  categoriesAtom,
  containersAtom,
  dispatchAtom,
  readyAtom,
  recurringRulesAtom,
} from "@/features/store";
import { describeRule } from "@/features/recurring/describe";
import { RecurringRuleSheet } from "@/features/recurring/RecurringRuleSheet";
import { categoryDotColor } from "@/features/category-color";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function RecurringView() {
  const ready = useAtomValue(readyAtom);
  const rules = useAtomValue(recurringRulesAtom);
  const categories = useAtomValue(categoriesAtom);
  const containers = useAtomValue(containersAtom);
  const dispatch = useSetAtom(dispatchAtom);

  // `null` = sheet closed; `"new"` = create; a rule = edit.
  const [sheet, setSheet] = useState<RecurringRule | "new" | null>(null);

  const active = useMemo(
    () =>
      rules
        .filter((r) => r.status === "active")
        .sort((a, b) => a.next_generation_date.localeCompare(b.next_generation_date)),
    [rules],
  );
  const cancelled = useMemo(() => rules.filter((r) => r.status === "cancelled"), [rules]);

  const catName = useMemo(() => {
    const m = new Map(categories.map((c) => [c.id, c.name]));
    return (id: string | null) => (id ? (m.get(id) ?? "Unknown") : null);
  }, [categories]);
  const contName = useMemo(() => {
    const m = new Map(containers.map((c) => [c.id, c.name]));
    return (id: string | null) => (id ? (m.get(id) ?? "Unknown") : "");
  }, [containers]);

  if (!ready) return <p className="text-muted-foreground py-16 text-sm">Loading…</p>;

  return (
    <div className="space-y-6">
      <section className="flex items-end justify-between pt-3 pb-1">
        <div>
          <p className="text-muted-foreground text-xs font-medium tracking-[0.18em] uppercase">
            Recurring
          </p>
          <h1 className="font-display mt-1 text-3xl leading-none">
            Scheduled transactions
          </h1>
          <p className="text-muted-foreground mt-3 max-w-md text-sm">
            Each rule drops one transaction into your inbox as it comes due — you always
            approve before anything is logged.
          </p>
        </div>
        <Button className="rounded-full" onClick={() => setSheet("new")}>
          <PlusIcon className="size-4" />
          New
        </Button>
      </section>

      <div className="bg-card overflow-hidden rounded-2xl border">
        {active.length === 0 ? (
          <div className="text-muted-foreground px-5 py-14 text-center text-sm">
            No recurring transactions yet. Add one to automate a bill, paycheck, or
            savings transfer.
          </div>
        ) : (
          active.map((r, i) => (
            <RuleRow
              key={r.id}
              rule={r}
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

      {cancelled.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-muted-foreground px-1 text-xs font-medium tracking-[0.14em] uppercase">
            Paused
          </h2>
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
                  className="rounded-full"
                  onClick={() => dispatch(uncancelRecurringRule(r.id))}
                >
                  <RotateCcwIcon className="size-4" />
                  Resume
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      <RecurringRuleSheet
        open={sheet !== null}
        rule={sheet === "new" ? null : sheet}
        categories={categories}
        containers={containers}
        onOpenChange={(open) => !open && setSheet(null)}
        onSubmit={async (input, editingId) => {
          if (editingId) {
            // Preserve the cursor + status; only the editable fields change.
            const prev = rules.find((r) => r.id === editingId)!;
            const next = makeRecurringRule({
              ...input,
              id: editingId,
              next_generation_date: prev.next_generation_date,
              status: prev.status,
            });
            await dispatch(updateRecurringRule(next));
            toast.success("Recurring updated", {
              description: input.template_vendor_source,
            });
          } else {
            await dispatch(createRecurringRule(input));
            toast.success("Recurring added", {
              description: input.template_vendor_source,
            });
          }
          setSheet(null);
        }}
      />
    </div>
  );
}

function RuleRow({
  rule,
  categoryName,
  containerName,
  toContainerName,
  divider,
  onEdit,
  onCancel,
}: {
  rule: RecurringRule;
  categoryName: string | null;
  containerName: string;
  toContainerName: string;
  divider: boolean;
  onEdit: () => void;
  onCancel: () => void;
}) {
  const transfer = isTransferRule(rule);
  const income = !transfer && (rule.template_amount ?? 0) >= 0;
  const sub = transfer
    ? [containerName || "Transfer", toContainerName].filter(Boolean).join(" → ")
    : [categoryName, containerName].filter(Boolean).join(" · ");

  return (
    <div
      className={cn(
        "group hover:bg-muted/40 flex items-center gap-3 px-5 py-3 transition-colors",
        divider && "border-t",
      )}
    >
      {transfer ? (
        <ArrowRightIcon className="text-muted-foreground size-2.5 shrink-0" aria-hidden />
      ) : (
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{
            backgroundColor: rule.template_category_id
              ? categoryDotColor(rule.template_category_id)
              : undefined,
          }}
          aria-hidden
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{rule.template_vendor_source}</div>
        <div className="text-muted-foreground truncate text-xs">
          {describeRule(rule)}
          {sub && <span> · {sub}</span>}
        </div>
      </div>
      <div className="flex flex-col items-end gap-0.5">
        <span
          className={cn(
            "tnum font-mono text-sm tracking-tight",
            income && "text-positive",
            transfer && "text-muted-foreground",
          )}
        >
          {formatCents(Math.abs(rule.template_amount ?? 0))}
        </span>
        <Badge variant="secondary" className="rounded-full text-[10px] font-normal">
          next {rule.next_generation_date.slice(5)}
        </Badge>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground size-8 rounded-lg opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
            aria-label={`Actions for ${rule.template_vendor_source}`}
          >
            <MoreHorizontalIcon className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onEdit}>
            <PencilIcon className="size-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={onCancel}>
            <XIcon className="size-4" />
            Pause
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
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
