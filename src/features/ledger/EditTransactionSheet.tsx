"use client";

import { useMemo, useState } from "react";
import { Trash2Icon } from "lucide-react";
import { updateTransaction } from "@/core/commands";
import { editOps, needsResplit } from "@/features/ledger/edit-distribution";
import { isTransfer } from "@/core/engine/balances";
import { activeRows } from "@/core/engine/ledger";
import {
  distributionPieces,
  splitIncome,
  usablePreset,
} from "@/core/engine/distribution";
import type { Op } from "@/core/oplog";
import {
  sortContainersAlphabetically,
  sortCategoriesAlphabetically,
} from "@/core/engine/usage-ranking";
import { formatCents, parseDollars } from "@/core/money";
import {
  transferLabel,
  type Category,
  type CategoryType,
  type Container,
  type DistributionPreset,
  type Transaction,
} from "@/core/model";
import { linesFromGroup, linesFromSplit } from "@/features/distribution/lines";
import { SplitBreakdown } from "@/features/distribution/SplitBreakdown";
import { CheckboxField } from "@/features/ui/CheckboxField";
import {
  defaultSign,
  resolveAmount,
  splitSign,
  type Sign,
} from "@/features/ledger/amount";
import { SignToggle } from "@/features/ledger/SignToggle";
import { InlineError } from "@/features/ui/InlineError";
import { categoryColor } from "@/features/category-color";
import { CategoryGlyph } from "@/features/category-icons";
import { instantFrom, timeInputValue } from "@/features/clock";
import { Button } from "@/components/ui/button";
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
import { ResponsiveSheet } from "@/features/ui";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const ENTRY_TYPES: { value: CategoryType; label: string }[] = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
];

export function EditTransactionSheet({
  editing,
  categories,
  containers,
  transactions,
  presets = [],
  onOpenChange,
  onSave,
  onDelete,
}: {
  editing: Transaction | null;
  categories: Category[];
  containers: Container[];
  transactions: Transaction[];
  /** Income-distribution presets (archived included). */
  presets?: DistributionPreset[];
  onOpenChange: (open: boolean) => void;
  /** The edit as one batch — the row, plus its pieces for a split income. The
   * first op is always the edited row itself. */
  onSave: (ops: Op[]) => Promise<void>;
  onDelete: (t: Transaction) => Promise<void>;
}) {
  const transfer = editing !== null && isTransfer(editing);
  return (
    <ResponsiveSheet
      open={editing !== null}
      onOpenChange={onOpenChange}
      title={transfer ? "Edit transfer" : "Edit transaction"}
      description="Changes are recorded as a ledger update — history is never lost."
    >
      {editing &&
        (transfer ? (
          <TransferForm
            key={editing.id}
            tx={editing}
            containers={containers}
            transactions={transactions}
            onSave={onSave}
            onDelete={onDelete}
          />
        ) : (
          <EditForm
            key={editing.id}
            tx={editing}
            categories={categories}
            containers={containers}
            transactions={transactions}
            presets={presets}
            onSave={onSave}
            onDelete={onDelete}
          />
        ))}
    </ResponsiveSheet>
  );
}

/** Archived containers stay on historical rows, but never return to a picker. */
function activeContainers(containers: Container[]) {
  return containers.filter((c) => !c.is_archived);
}

/**
 * The entry's instant after an edit. Left untouched when neither the date nor
 * the time changed — a `<input type="time">` only carries minutes, so rebuilding
 * on every save would quietly round the seconds off rows logged seconds apart and
 * put them back in a tie. Clearing the time leaves the row without an instant,
 * exactly like one written before the field existed.
 */
function resolveEnteredAt(tx: Transaction, date: string, time: string): string | null {
  const unchanged = date === tx.date && time === timeInputValue(tx.entered_at);
  return unchanged ? tx.entered_at : instantFrom(date, time);
}

/** Date and time side by side — one thought, two controls (the time is optional,
 * so a row that never had one keeps a blank field rather than a made-up midnight). */
function WhenFields({
  idPrefix,
  date,
  time,
  onDate,
  onTime,
}: {
  idPrefix: string;
  date: string;
  time: string;
  onDate: (v: string) => void;
  onTime: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-date`}>Date</Label>
        <Input
          id={`${idPrefix}-date`}
          type="date"
          value={date}
          onChange={(e) => onDate(e.target.value)}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-time`}>Time</Label>
        <Input
          id={`${idPrefix}-time`}
          type="time"
          value={time}
          onChange={(e) => onTime(e.target.value)}
          className="tnum font-mono"
        />
      </div>
    </div>
  );
}

function DeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      className="text-muted-foreground hover:text-destructive mr-auto"
      onClick={onClick}
    >
      <Trash2Icon className="size-4" />
      Delete
    </Button>
  );
}

function EditForm({
  tx,
  categories,
  containers,
  transactions,
  presets,
  onSave,
  onDelete,
}: {
  tx: Transaction;
  categories: Category[];
  containers: Container[];
  transactions: Transaction[];
  presets: DistributionPreset[];
  onSave: (ops: Op[]) => Promise<void>;
  onDelete: (t: Transaction) => Promise<void>;
}) {
  const active = useMemo(
    () =>
      sortCategoriesAlphabetically(
        categories.filter((c) => !c.is_archived || c.id === tx.category_id),
      ),
    [categories, tx.category_id],
  );
  const wallets = useMemo(
    () => sortContainersAlphabetically(activeContainers(containers)),
    [containers, tx.category_id],
  );

  const [date, setDate] = useState(tx.date);
  const [time, setTime] = useState(() => timeInputValue(tx.entered_at));
  const [vendor, setVendor] = useState(tx.vendor_source);
  const [notes, setNotes] = useState(tx.notes ?? "");
  const [type, setType] = useState<CategoryType>(() => {
    const saved = categories.find((c) => c.id === tx.category_id);
    return saved?.type ?? (tx.amount >= 0 ? "income" : "expense");
  });
  const categoriesOfType = active.filter((c) => c.type === type);
  const [pickedCategoryId, setPickedCategoryId] = useState(tx.category_id ?? "");
  const [containerId, setContainerId] = useState(tx.container_id);
  const [amountStr, setAmountStr] = useState((Math.abs(tx.amount) / 100).toFixed(2));
  // The row's own direction is the starting point — editing a refund keeps it.
  const [pickedSign, setPickedSign] = useState<Sign | null>(tx.amount >= 0 ? "+" : "-");
  const [warn, setWarn] = useState<string | null>(null);
  const [error, setError] = useState("");

  const cat =
    categoriesOfType.find((c) => c.id === pickedCategoryId) ?? categoriesOfType[0];
  const categoryId = cat?.id ?? "";
  const container = containers.find((c) => c.id === containerId);
  const sign: Sign = pickedSign ?? defaultSign(type);

  // ── Distribution (plans/income-distribution.md) ──
  // A pending occurrence has no pieces yet — Approve writes them — so for it
  // Distribute only chooses the preset Approve will use.
  const pending = tx.inbox_status === "pending";
  const ownPieces = useMemo(
    () => distributionPieces(activeRows(transactions)).get(tx.id) ?? [],
    [transactions, tx.id],
  );
  const wasDistributed = tx.distribution_preset_id !== null || ownPieces.length > 0;
  const usablePresets = useMemo(
    () => presets.filter((p) => usablePreset(p.id, presets, containers) !== null),
    [presets, containers],
  );
  const recordedPreset = presets.find((p) => p.id === tx.distribution_preset_id) ?? null;
  const [distribute, setDistribute] = useState(wasDistributed);
  const [presetId, setPresetId] = useState<string | null>(
    () => usablePreset(tx.distribution_preset_id, presets, containers)?.id ?? null,
  );
  const preset = usablePreset(presetId, presets, containers);
  const moneyIn = cat?.type === "income" && sign === "+";
  const showDistribute = moneyIn && (usablePresets.length > 0 || distribute);

  let typedCents: number | null = null;
  try {
    typedCents = Math.abs(parseDollars(amountStr));
  } catch {
    typedCents = null;
  }
  // Re-split only when what the split depends on changed; a payee or date edit
  // keeps the pieces' cents exactly as they were.
  const resplit = needsResplit({
    tx,
    amount: typedCents === null ? tx.amount : sign === "-" ? -typedCents : typedCents,
    distribute,
    moneyIn,
    wasDistributed,
    presetId,
  });
  const preview = useMemo(() => {
    if (!distribute || !moneyIn) return null;
    if (!pending && !resplit && ownPieces.length > 0) {
      return {
        lines: linesFromGroup(tx, ownPieces, containers),
        total: tx.amount,
        note: null,
      };
    }
    if (!preset || !typedCents) return null;
    const split = splitIncome(typedCents, preset, containers);
    if (!split.ok) return null;
    return { total: typedCents, ...linesFromSplit(split, preset, containers) };
  }, [
    distribute,
    moneyIn,
    pending,
    resplit,
    ownPieces,
    tx,
    containers,
    preset,
    typedCents,
  ]);

  function selectType(next: CategoryType) {
    setType(next);
    setPickedCategoryId("");
    setPickedSign(null);
    setWarn(null);
    setError("");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!vendor.trim()) return setError("Add a payee or source.");
    if (!cat) return setError("Pick a category.");

    const res = resolveAmount(amountStr, cat.type, sign);
    if (!res.ok) return setError(res.error);
    if (res.unusual && warn === null) {
      setWarn(
        `${formatCents(res.signed)} is money ${sign === "+" ? "in" : "out"} on a ${cat.type} category. Save again to confirm.`,
      );
      return;
    }

    const next: Transaction = {
      ...tx,
      date,
      entered_at: resolveEnteredAt(tx, date, time),
      amount: res.signed,
      vendor_source: vendor.trim(),
      category_id: categoryId,
      container_id: containerId,
      notes: notes.trim() || null,
      yearMonth: date.slice(0, 7),
    };

    const out = editOps(
      {
        tx,
        next,
        moneyIn: cat.type === "income" && res.signed > 0,
        distribute,
        presetId,
      },
      { presets, containers, transactions },
    );
    if (!out.ok) return setError(out.error);
    await onSave(out.ops);
  }

  return (
    <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
      <div className="grid gap-4 px-4">
        {error && <InlineError id="edit-transaction-error">{error}</InlineError>}
        <ToggleGroup
          type="single"
          value={type}
          onValueChange={(value) => value && selectType(value as CategoryType)}
          aria-label="Type"
          className="bg-muted/60 w-full rounded-full p-0.5"
        >
          {ENTRY_TYPES.map((entryType) => (
            <ToggleGroupItem
              key={entryType.value}
              value={entryType.value}
              className="data-[state=on]:bg-background data-[state=on]:text-primary h-8 flex-1 rounded-full text-xs"
            >
              {entryType.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <WhenFields
          idPrefix="edit"
          date={date}
          time={time}
          onDate={setDate}
          onTime={setTime}
        />
        <div className="grid gap-1.5">
          <Label htmlFor="edit-vendor">{type === "income" ? "Source" : "Vendor"}</Label>
          <Input
            id="edit-vendor"
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="edit-category">Category</Label>
          <Select
            value={categoryId}
            onValueChange={(v) => {
              setPickedCategoryId(v);
              setWarn(null);
            }}
          >
            <SelectTrigger id="edit-category" aria-label="Category">
              <SelectValue placeholder={`No ${type} categories yet`}>
                {cat ? (
                  <span className="flex items-center gap-2">
                    <CategoryGlyph icon={cat.icon} color={categoryColor(cat)} />
                    {cat.name}
                  </span>
                ) : undefined}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {categoriesOfType.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <CategoryGlyph icon={c.icon} color={categoryColor(c)} />
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="edit-amount">Amount</Label>
          <div className="flex items-center gap-1.5">
            <SignToggle
              sign={sign}
              onChange={(next) => {
                setPickedSign(next);
                setWarn(null);
              }}
              className="border-input size-9 shrink-0 rounded-lg border"
            />
            <Input
              id="edit-amount"
              value={amountStr}
              onChange={(e) => {
                const { sign: typed, rest } = splitSign(e.target.value);
                if (typed) setPickedSign(typed);
                setAmountStr(rest);
                setWarn(null);
              }}
              inputMode="decimal"
              className="tnum font-mono"
            />
          </div>
          {warn && <p className="text-xs text-amber-600 dark:text-amber-500">{warn}</p>}
        </div>
        {showDistribute && (
          <CheckboxField
            checked={distribute}
            onCheckedChange={(on) => {
              setDistribute(on);
              setError("");
              if (on && !presetId) setPresetId(usablePresets[0]?.id ?? null);
            }}
          >
            Distribute across containers
          </CheckboxField>
        )}
        {distribute && moneyIn ? (
          <div className="grid gap-1.5">
            <Label htmlFor="edit-distribution">Split</Label>
            <Select
              key="distribution"
              value={presetId ?? ""}
              onValueChange={(v) => {
                if (!v) return; // a remounting Radix Select reports ""
                setPresetId(v);
                setError("");
              }}
            >
              <SelectTrigger id="edit-distribution" aria-label="Distribution">
                <SelectValue placeholder="Pick a distribution">
                  {preset?.name}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {usablePresets.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {recordedPreset && !preset && (
              <p className="text-muted-foreground text-xs">
                Split by {recordedPreset.name}, which can&apos;t split any more. Saving
                keeps the split as it is; pick a distribution to re-split it.
              </p>
            )}
            {resplit && wasDistributed && (
              <p className="text-muted-foreground text-xs">
                Saving re-splits at {preset?.name ?? "the distribution"}&apos;s current
                shares.
              </p>
            )}
            {preview && (
              <SplitBreakdown
                lines={preview.lines}
                total={preview.total}
                note={preview.note}
                className="bg-surface-sunken/60 rounded-lg border p-1.5"
              />
            )}
          </div>
        ) : (
          <div className="grid gap-1.5">
            <Label htmlFor="edit-container">Container</Label>
            <Select
              key="container"
              value={containerId}
              onValueChange={(v) => v && setContainerId(v)}
            >
              <SelectTrigger id="edit-container" aria-label="Container">
                <SelectValue placeholder="Container">{container?.name}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {wallets.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="edit-notes">Notes</Label>
          <Textarea
            id="edit-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional"
            rows={3}
            className="resize-none"
          />
        </div>
      </div>

      <SheetFooter className="mt-auto flex-row items-center gap-2">
        <DeleteButton onClick={() => onDelete(tx)} />
        <Button type="submit">Save changes</Button>
      </SheetFooter>
    </form>
  );
}

/**
 * Transfers have no category and two containers (§5.4). The row stays a single
 * negative amount on the source; the user only ever types a magnitude.
 */
function TransferForm({
  tx,
  containers,
  transactions,
  onSave,
  onDelete,
}: {
  tx: Transaction;
  containers: Container[];
  transactions: Transaction[];
  onSave: (ops: Op[]) => Promise<void>;
  onDelete: (t: Transaction) => Promise<void>;
}) {
  const wallets = useMemo(
    () => sortContainersAlphabetically(activeContainers(containers)),
    [containers, tx.container_id],
  );

  const [date, setDate] = useState(tx.date);
  const [time, setTime] = useState(() => timeInputValue(tx.entered_at));
  const [vendor, setVendor] = useState(tx.vendor_source);
  const [notes, setNotes] = useState(tx.notes ?? "");
  const [fromId, setFromId] = useState(tx.container_id);
  const [toId, setToId] = useState(tx.to_container_id ?? "");
  const [amountStr, setAmountStr] = useState((Math.abs(tx.amount) / 100).toFixed(2));
  const [error, setError] = useState("");

  const from = containers.find((c) => c.id === fromId);
  const to = containers.find((c) => c.id === toId);
  const synthesized =
    from && to && tx.vendor_source === transferLabel(from.name, to.name);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!from || !to) return setError("Pick where the money goes.");
    if (from.id === to.id) return setError("Pick two different containers.");
    let magnitude: number;
    try {
      magnitude = Math.abs(parseDollars(amountStr));
    } catch {
      return setError("Enter a valid amount.");
    }
    if (magnitude === 0) return setError("Amount can't be zero.");

    // Keep an auto-generated label in step with the containers; a label the user
    // wrote is theirs to keep (§5.4).
    const label = synthesized ? transferLabel(from.name, to.name) : vendor.trim();

    await onSave([
      updateTransaction({
        ...tx,
        date,
        entered_at: resolveEnteredAt(tx, date, time),
        amount: -magnitude,
        vendor_source: label || transferLabel(from.name, to.name),
        container_id: from.id,
        to_container_id: to.id,
        notes: notes.trim() || null,
        yearMonth: date.slice(0, 7),
      }),
    ]);
  }

  return (
    <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
      <div className="grid gap-4 px-4">
        {error && <InlineError id="edit-transfer-error">{error}</InlineError>}
        <WhenFields
          idPrefix="transfer"
          date={date}
          time={time}
          onDate={setDate}
          onTime={setTime}
        />
        <div className="grid gap-1.5">
          <Label htmlFor="transfer-from">From</Label>
          <Select value={fromId} onValueChange={setFromId}>
            <SelectTrigger id="transfer-from" aria-label="From container">
              <SelectValue placeholder="From">{from?.name}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {wallets.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="transfer-to">To</Label>
          <Select value={toId} onValueChange={setToId}>
            <SelectTrigger id="transfer-to" aria-label="To container">
              <SelectValue placeholder="To">{to?.name}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {wallets
                .filter((c) => c.id !== fromId)
                .map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="transfer-label">Label</Label>
          <Input
            id="transfer-label"
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="transfer-amount">Amount</Label>
          <Input
            id="transfer-amount"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            inputMode="decimal"
            className="tnum font-mono"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="transfer-notes">Notes</Label>
          <Textarea
            id="transfer-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional"
            rows={3}
            className="resize-none"
          />
        </div>
      </div>

      <SheetFooter className="mt-auto flex-row items-center gap-2">
        <DeleteButton onClick={() => onDelete(tx)} />
        <Button type="submit">Save changes</Button>
      </SheetFooter>
    </form>
  );
}
