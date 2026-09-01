"use client";

import { useMemo } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { toast } from "sonner";
import { ArrowRightIcon, XIcon } from "lucide-react";
import { createTemplate, logTemplate, removeTemplate } from "@/core/commands";
import { rankShortcutsByUsage } from "@/core/engine/usage-ranking";
import { formatCents } from "@/core/money";
import type { Transaction } from "@/core/model";
import { todayIso } from "@/features/clock";
import {
  categoriesAtom,
  containersAtom,
  defaultContainerIdAtom,
  dispatchAtom,
  flashRowAtom,
  quickAddAtom,
  templatesAtom,
  transactionsAtom,
} from "@/features/store";
import { categoryColor } from "@/features/category-color";
import { CategoryGlyph } from "@/features/category-icons";
import { Eyebrow, Money, ResponsiveSheet } from "@/features/ui";
import { SignToggle } from "@/features/ledger/SignToggle";
import { CreationTextCombobox } from "@/features/ledger/CreationCombobox";
import { useComposeFields, type ComposeKind } from "@/features/ledger/useComposeFields";
import { InlineError } from "@/features/ui/InlineError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Textarea } from "@/components/ui/textarea";

const KINDS: { value: ComposeKind; label: string }[] = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfer" },
];

/**
 * Quick-add — the sheet the FAB raises, and the front half of §12.5's one
 * orchestrated moment: it rises on `--dur-3`, you log, and the row lands in the
 * register with a single iris wash on `--dur-2`.
 *
 * The **shortcuts strip lives here now**, off the ledger (the declutter this
 * milestone was asked for): a saved shortcut is something you reach for when you
 * are about to write an entry, not furniture on the screen you read.
 *
 * The form is mounted only while the sheet is open, so every visit starts on the
 * kind that asked for it (the FAB opens on Expense, the ⌘K palette on whatever
 * you picked) with an empty amount and the clock rolled forward.
 */
export function QuickAddSheet() {
  const [openKind, setOpenKind] = useAtom(quickAddAtom);

  return (
    <ResponsiveSheet
      open={openKind !== null}
      onOpenChange={(next) => !next && setOpenKind(null)}
      title="Add an entry"
      description="Log an expense, income, or a move between containers."
      scrollHeader
    >
      {openKind !== null && (
        <QuickAddForm initialKind={openKind} onDone={() => setOpenKind(null)} />
      )}
    </ResponsiveSheet>
  );
}

function QuickAddForm({
  initialKind,
  onDone,
}: {
  initialKind: ComposeKind;
  onDone: () => void;
}) {
  const categories = useAtomValue(categoriesAtom);
  const containers = useAtomValue(containersAtom);
  const templates = useAtomValue(templatesAtom);
  const transactions = useAtomValue(transactionsAtom);
  const defaultContainerId = useAtomValue(defaultContainerIdAtom);
  const dispatch = useSetAtom(dispatchAtom);
  const flashRow = useSetAtom(flashRowAtom);
  const rankedTemplates = useMemo(
    () => rankShortcutsByUsage(templates, transactions),
    [templates, transactions],
  );

  const f = useComposeFields({
    categories,
    containers,
    transactions,
    defaultContainerId,
    initialKind,
    onLogged: onDone,
  });

  async function quickLog(template: Transaction) {
    const op = logTemplate(template, { date: todayIso() });
    try {
      await dispatch(op);
    } catch {
      return; // already logged and toasted by `dispatchAtom`
    }
    if (op.type === "transaction.create") flashRow({ id: op.payload.row.id });
    onDone();
  }

  async function removeShortcut(template: Transaction) {
    const transfer = template.to_container_id !== null;
    const name = template.template_name ?? template.vendor_source;
    await dispatch(removeTemplate(template.id));
    toast.success("Shortcut removed", {
      description: name,
      action: {
        label: "Undo",
        onClick: () =>
          void dispatch(
            createTemplate({
              id: template.id,
              template_name: name,
              amount: template.amount,
              vendor_source: template.vendor_source,
              container_id: template.container_id,
              category_id: transfer ? null : template.category_id,
              to_container_id: transfer ? template.to_container_id : null,
              notes: template.notes,
            }),
          ),
      },
    });
  }

  const submitLabel =
    f.kind === "transfer"
      ? "Move money"
      : f.kind === "income"
        ? "Log income"
        : "Log expense";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void f.submit();
      }}
      className="space-y-5 px-5 pt-1 pb-7"
    >
      {rankedTemplates.length > 0 && (
        <div className="space-y-2">
          <Eyebrow as="h3">Shortcuts</Eyebrow>
          {/* Stacked, not strung out: a name and its amount on two lines makes a
              card you can read at a glance and hit with a thumb, where one long
              pill per shortcut ran the strip off the side of the screen after
              three of them. */}
          <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
            {rankedTemplates.map((t) => (
              <div key={t.id} className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => void quickLog(t)}
                  className="border-input bg-card hover:border-primary/30 flex w-32 flex-col items-start gap-0.5 rounded-xl border px-3 py-2 text-left transition-colors duration-[var(--dur-1)]"
                >
                  <span className="w-full truncate pr-4 text-sm font-medium">
                    {t.template_name}
                  </span>
                  <Money
                    cents={t.amount}
                    absolute={t.to_container_id !== null}
                    tone="quiet"
                    className="text-xs"
                  />
                </button>
                <button
                  type="button"
                  onClick={() => void removeShortcut(t)}
                  aria-label={`Remove ${t.template_name} shortcut`}
                  className="text-muted-foreground hover:text-destructive absolute top-1 right-1 rounded-full p-1"
                >
                  <XIcon className="size-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <ToggleGroup
        type="single"
        value={f.kind}
        onValueChange={(v) => v && f.setKind(v as ComposeKind)}
        className="bg-muted/60 w-full rounded-full p-0.5"
      >
        {KINDS.map((k) => (
          <ToggleGroupItem
            key={k.value}
            value={k.value}
            className="data-[state=on]:bg-background data-[state=on]:text-primary h-8 flex-1 rounded-full text-xs"
          >
            {k.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {/* The figure you are writing: mono and tabular like every amount in the
          app (§12.3), and big enough to be the only thing you look at. */}
      <div className="flex items-center justify-center gap-1 py-1">
        {f.kind !== "transfer" && (
          <SignToggle sign={f.sign} onChange={f.setSign} className="size-10 text-xl" />
        )}
        <span className="text-muted-foreground tnum font-mono text-3xl" aria-hidden>
          $
        </span>
        <Input
          value={f.amountStr}
          onChange={(e) => f.onAmountChange(e.target.value)}
          placeholder="0.00"
          inputMode="decimal"
          aria-label="Amount"
          className="tnum h-14 w-40 border-0 bg-transparent p-0 font-mono text-4xl shadow-none focus-visible:ring-0 md:text-4xl"
        />
      </div>

      <div className="grid grid-cols-[5.5rem_1fr] items-center gap-x-3 gap-y-2">
        <FieldLabel>
          {f.kind === "transfer" ? "Label" : f.kind === "income" ? "Source" : "Vendor"}
        </FieldLabel>
        {f.kind === "transfer" ? (
          <Input
            value={f.vendor}
            onChange={(e) => f.setVendor(e.target.value)}
            placeholder="Optional"
            aria-label="Transfer label"
            className="h-9"
          />
        ) : (
          <CreationTextCombobox
            value={f.vendor}
            onValueChange={f.setVendor}
            onMatch={f.recallVendor}
            suggestions={f.vendorSources}
            placeholder={f.kind === "income" ? "e.g. Employer" : "e.g. Blue Bottle"}
            aria-label={f.kind === "income" ? "Source" : "Vendor"}
            className="h-9"
          />
        )}

        {f.kind !== "transfer" && (
          <>
            <FieldLabel>Category</FieldLabel>
            <Select value={f.categoryId} onValueChange={f.setCategoryId}>
              <SelectTrigger aria-label="Category" className="h-9">
                <SelectValue placeholder={`No ${f.kind} categories yet`} />
              </SelectTrigger>
              <SelectContent>
                {f.categoriesOfKind.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <CategoryGlyph icon={c.icon} color={categoryColor(c)} />
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}

        <FieldLabel>{f.kind === "transfer" ? "From" : "Container"}</FieldLabel>
        <Select value={f.containerId} onValueChange={f.setPickedContainerId}>
          <SelectTrigger
            aria-label={f.kind === "transfer" ? "From container" : "Container"}
            className="h-9"
          >
            <SelectValue placeholder="Container" />
          </SelectTrigger>
          <SelectContent>
            {f.activeContainers.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {f.kind === "transfer" && (
          <>
            <FieldLabel>
              <ArrowRightIcon className="mr-1 inline size-3" aria-hidden />
              To
            </FieldLabel>
            <Select value={f.toContainerId} onValueChange={f.setToContainerId}>
              <SelectTrigger aria-label="To container" className="h-9">
                <SelectValue placeholder="To…" />
              </SelectTrigger>
              <SelectContent>
                {f.activeContainers
                  .filter((c) => c.id !== f.containerId)
                  .map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </>
        )}

        <FieldLabel>When</FieldLabel>
        <Input
          type="datetime-local"
          value={f.when}
          onChange={(e) => f.setWhen(e.target.value)}
          aria-label="Date and time"
          className="tnum h-9"
        />

        <FieldLabel>Notes</FieldLabel>
        <Textarea
          value={f.notes}
          onChange={(e) => f.setNotes(e.target.value)}
          placeholder="Optional"
          aria-label="Notes"
          rows={2}
          className="min-h-16 resize-none"
        />
      </div>

      {f.warn && <p className="text-xs text-amber-600 dark:text-amber-500">{f.warn}</p>}
      {f.error && <InlineError id="quick-add-error">{f.error}</InlineError>}

      <Button type="submit" className="h-11 w-full rounded-xl text-sm">
        {submitLabel}
      </Button>
    </form>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-muted-foreground text-sm">{children}</span>;
}

/** A transfer has no direction to print — the arrow carries it (§12.2). */
function shortcutAmount(t: Transaction): number {
  return t.to_container_id !== null ? Math.abs(t.amount) : t.amount;
}
