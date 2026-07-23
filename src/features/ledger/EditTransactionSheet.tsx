"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Trash2Icon } from "lucide-react";
import { updateTransaction } from "@/core/commands";
import { isTransfer } from "@/core/engine/balances";
import { formatCents, parseDollars } from "@/core/money";
import {
  transferLabel,
  type Category,
  type Container,
  type Transaction,
} from "@/core/model";
import {
  defaultSign,
  resolveAmount,
  splitSign,
  type Sign,
} from "@/features/ledger/amount";
import { SignToggle } from "@/features/ledger/SignToggle";
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

export function EditTransactionSheet({
  editing,
  categories,
  containers,
  onOpenChange,
  onSave,
  onDelete,
}: {
  editing: Transaction | null;
  categories: Category[];
  containers: Container[];
  onOpenChange: (open: boolean) => void;
  onSave: (op: ReturnType<typeof updateTransaction>) => Promise<void>;
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
            onSave={onSave}
            onDelete={onDelete}
          />
        ) : (
          <EditForm
            key={editing.id}
            tx={editing}
            categories={categories}
            containers={containers}
            onSave={onSave}
            onDelete={onDelete}
          />
        ))}
    </ResponsiveSheet>
  );
}

/** Keep an archived container selectable on a row that already uses it (§5.5). */
function selectableContainers(containers: Container[], ...keep: (string | null)[]) {
  return containers.filter((c) => !c.is_archived || keep.includes(c.id));
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
  onSave,
  onDelete,
}: {
  tx: Transaction;
  categories: Category[];
  containers: Container[];
  onSave: (op: ReturnType<typeof updateTransaction>) => Promise<void>;
  onDelete: (t: Transaction) => Promise<void>;
}) {
  const active = useMemo(
    () =>
      categories
        .filter((c) => !c.is_archived || c.id === tx.category_id)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [categories, tx.category_id],
  );
  const wallets = useMemo(
    () => selectableContainers(containers, tx.container_id),
    [containers, tx.container_id],
  );

  const [date, setDate] = useState(tx.date);
  const [time, setTime] = useState(() => timeInputValue(tx.entered_at));
  const [vendor, setVendor] = useState(tx.vendor_source);
  const [categoryId, setCategoryId] = useState(tx.category_id ?? active[0]?.id ?? "");
  const [containerId, setContainerId] = useState(tx.container_id);
  const [amountStr, setAmountStr] = useState((Math.abs(tx.amount) / 100).toFixed(2));
  // The row's own direction is the starting point — editing a refund keeps it.
  const [pickedSign, setPickedSign] = useState<Sign | null>(tx.amount >= 0 ? "+" : "-");
  const [warn, setWarn] = useState<string | null>(null);

  const cat = categories.find((c) => c.id === categoryId);
  const sign: Sign = pickedSign ?? defaultSign(cat?.type ?? "expense");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!vendor.trim()) return toast.error("Add a payee or source.");
    if (!cat) return toast.error("Pick a category.");

    const res = resolveAmount(amountStr, cat.type, sign);
    if (!res.ok) return toast.error(res.error);
    if (res.unusual && warn === null) {
      setWarn(
        `${formatCents(res.signed)} is money ${sign === "+" ? "in" : "out"} on a ${cat.type} category. Save again to confirm.`,
      );
      return;
    }

    await onSave(
      updateTransaction({
        ...tx,
        date,
        entered_at: resolveEnteredAt(tx, date, time),
        amount: res.signed,
        vendor_source: vendor.trim(),
        category_id: categoryId,
        container_id: containerId,
        yearMonth: date.slice(0, 7),
      }),
    );
    toast.success("Transaction updated");
  }

  return (
    <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
      <div className="grid gap-4 px-4">
        <WhenFields
          idPrefix="edit"
          date={date}
          time={time}
          onDate={setDate}
          onTime={setTime}
        />
        <div className="grid gap-1.5">
          <Label htmlFor="edit-vendor">Payee / source</Label>
          <Input
            id="edit-vendor"
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label>Category</Label>
          <Select
            value={categoryId}
            onValueChange={(v) => {
              setCategoryId(v);
              setWarn(null);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              {active.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <CategoryGlyph icon={c.icon} color={categoryColor(c)} />
                  {c.name}
                  <span className="text-muted-foreground ml-1">· {c.type}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>Container</Label>
          <Select value={containerId} onValueChange={setContainerId}>
            <SelectTrigger>
              <SelectValue placeholder="Container" />
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
  onSave,
  onDelete,
}: {
  tx: Transaction;
  containers: Container[];
  onSave: (op: ReturnType<typeof updateTransaction>) => Promise<void>;
  onDelete: (t: Transaction) => Promise<void>;
}) {
  const wallets = useMemo(
    () => selectableContainers(containers, tx.container_id, tx.to_container_id),
    [containers, tx.container_id, tx.to_container_id],
  );

  const [date, setDate] = useState(tx.date);
  const [time, setTime] = useState(() => timeInputValue(tx.entered_at));
  const [vendor, setVendor] = useState(tx.vendor_source);
  const [fromId, setFromId] = useState(tx.container_id);
  const [toId, setToId] = useState(tx.to_container_id ?? "");
  const [amountStr, setAmountStr] = useState((Math.abs(tx.amount) / 100).toFixed(2));

  const from = containers.find((c) => c.id === fromId);
  const to = containers.find((c) => c.id === toId);
  const synthesized =
    from && to && tx.vendor_source === transferLabel(from.name, to.name);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!from || !to) return toast.error("Pick where the money goes.");
    if (from.id === to.id) return toast.error("Pick two different containers.");
    let magnitude: number;
    try {
      magnitude = Math.abs(parseDollars(amountStr));
    } catch {
      return toast.error("Enter a valid amount.");
    }
    if (magnitude === 0) return toast.error("Amount can't be zero.");

    // Keep an auto-generated label in step with the containers; a label the user
    // wrote is theirs to keep (§5.4).
    const label = synthesized ? transferLabel(from.name, to.name) : vendor.trim();

    await onSave(
      updateTransaction({
        ...tx,
        date,
        entered_at: resolveEnteredAt(tx, date, time),
        amount: -magnitude,
        vendor_source: label || transferLabel(from.name, to.name),
        container_id: from.id,
        to_container_id: to.id,
        yearMonth: date.slice(0, 7),
      }),
    );
    toast.success("Transfer updated");
  }

  return (
    <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
      <div className="grid gap-4 px-4">
        <WhenFields
          idPrefix="transfer"
          date={date}
          time={time}
          onDate={setDate}
          onTime={setTime}
        />
        <div className="grid gap-1.5">
          <Label>From</Label>
          <Select value={fromId} onValueChange={setFromId}>
            <SelectTrigger>
              <SelectValue placeholder="From" />
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
          <Label>To</Label>
          <Select value={toId} onValueChange={setToId}>
            <SelectTrigger>
              <SelectValue placeholder="To" />
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
          <Label htmlFor="transfer-note">Note</Label>
          <Input
            id="transfer-note"
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
      </div>

      <SheetFooter className="mt-auto flex-row items-center gap-2">
        <DeleteButton onClick={() => onDelete(tx)} />
        <Button type="submit">Save changes</Button>
      </SheetFooter>
    </form>
  );
}
