"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Trash2Icon } from "lucide-react";
import { updateTransaction } from "@/core/commands";
import { formatCents } from "@/core/money";
import type { Category, Transaction } from "@/core/model";
import { resolveAmount } from "@/features/ledger/amount";
import { categoryDotColor } from "@/features/category-color";
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
  onOpenChange,
  onSave,
  onDelete,
}: {
  editing: Transaction | null;
  categories: Category[];
  onOpenChange: (open: boolean) => void;
  onSave: (op: ReturnType<typeof updateTransaction>) => Promise<void>;
  onDelete: (t: Transaction) => Promise<void>;
}) {
  return (
    <Sheet open={editing !== null} onOpenChange={onOpenChange}>
      <SheetContent className="gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-display text-xl">Edit transaction</SheetTitle>
          <SheetDescription>
            Changes are recorded as a ledger update — history is never lost.
          </SheetDescription>
        </SheetHeader>
        {editing && (
          <EditForm
            key={editing.id}
            tx={editing}
            categories={categories}
            onSave={onSave}
            onDelete={onDelete}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function EditForm({
  tx,
  categories,
  onSave,
  onDelete,
}: {
  tx: Transaction;
  categories: Category[];
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

  const [date, setDate] = useState(tx.date);
  const [vendor, setVendor] = useState(tx.vendor_source);
  const [categoryId, setCategoryId] = useState(tx.category_id ?? active[0]?.id ?? "");
  const [amountStr, setAmountStr] = useState((Math.abs(tx.amount) / 100).toFixed(2));
  const [warn, setWarn] = useState<string | null>(null);

  const cat = categories.find((c) => c.id === categoryId);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!vendor.trim()) return toast.error("Add a payee or source.");
    if (!cat) return toast.error("Pick a category.");

    const res = resolveAmount(amountStr, cat.type);
    if (!res.ok) return toast.error(res.error);
    if (res.unusual && warn === null) {
      setWarn(
        `${formatCents(res.signed)} is unusual for a ${cat.type} category. Save again to confirm.`,
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
          <Label htmlFor="edit-amount">Amount</Label>
          <Input
            id="edit-amount"
            value={amountStr}
            onChange={(e) => {
              setAmountStr(e.target.value);
              setWarn(null);
            }}
            inputMode="decimal"
            className="tnum font-mono"
          />
          {warn && <p className="text-xs text-amber-600 dark:text-amber-500">{warn}</p>}
        </div>
      </div>

      <SheetFooter className="mt-auto flex-row items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          className="text-muted-foreground hover:text-destructive mr-auto"
          onClick={() => onDelete(tx)}
        >
          <Trash2Icon className="size-4" />
          Delete
        </Button>
        <Button type="submit">Save changes</Button>
      </SheetFooter>
    </form>
  );
}
