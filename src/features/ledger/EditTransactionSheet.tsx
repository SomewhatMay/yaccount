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
import { categoryDotColor } from "@/features/category-color";
import { formatEnteredAt } from "@/features/clock";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

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
  // When this row was written, as opposed to the date it is filed under — the two
  // differ whenever the user backdates an entry, and it is what orders the day.
  const enteredAt = formatEnteredAt(editing?.entered_at);
  return (
    <Sheet open={editing !== null} onOpenChange={onOpenChange}>
      <SheetContent className="gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-display text-xl">
            {transfer ? "Edit transfer" : "Edit transaction"}
          </SheetTitle>
          <SheetDescription>
            Changes are recorded as a ledger update — history is never lost.
          </SheetDescription>
          {editing && enteredAt !== null && (
            <p className="text-muted-foreground/80 mt-1 text-xs">Entered {enteredAt}</p>
          )}
        </SheetHeader>
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
      </SheetContent>
    </Sheet>
  );
}

/** Keep an archived container selectable on a row that already uses it (§5.5). */
function selectableContainers(containers: Container[], ...keep: (string | null)[]) {
  return containers.filter((c) => !c.is_archived || keep.includes(c.id));
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
        <div className="grid gap-1.5">
          <Label htmlFor="edit-date">Date</Label>
          <Input
            id="edit-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
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
                  <span
                    className="mr-0.5 size-2 rounded-full"
                    style={{ backgroundColor: categoryDotColor(c.id) }}
                  />
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
        <div className="grid gap-1.5">
          <Label htmlFor="transfer-date">Date</Label>
          <Input
            id="transfer-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
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
