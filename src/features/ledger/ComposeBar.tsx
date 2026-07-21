"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PlusIcon } from "lucide-react";
import { createTransaction } from "@/core/commands";
import { formatCents } from "@/core/money";
import type { Category } from "@/core/model";
import { resolveAmount } from "@/features/ledger/amount";
import { categoryDotColor } from "@/features/category-color";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const today = (): string => new Date().toISOString().slice(0, 10);

export function ComposeBar({
  categories,
  onSubmit,
}: {
  categories: Category[];
  onSubmit: (op: ReturnType<typeof createTransaction>) => Promise<void>;
}) {
  const active = useMemo(
    () =>
      categories
        .filter((c) => !c.is_archived)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [categories],
  );

  const [date, setDate] = useState(today());
  const [vendor, setVendor] = useState("");
  const [categoryId, setCategoryId] = useState(active[0]?.id ?? "");
  const [amountStr, setAmountStr] = useState("");
  const [warn, setWarn] = useState<string | null>(null);

  const cat = categories.find((c) => c.id === categoryId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!vendor.trim()) return toast.error("Add a payee or source.");
    if (!cat) return toast.error("Add a category first.");

    const res = resolveAmount(amountStr, cat.type);
    if (!res.ok) return toast.error(res.error);

    // Inline confirm on an unusual sign — arm once, commit on the next submit.
    if (res.unusual && warn === null) {
      setWarn(
        `${formatCents(res.signed)} is unusual for a ${cat.type} category — looks like a refund or void. Add again to confirm.`,
      );
      return;
    }

    await onSubmit(
      createTransaction({
        date,
        amount: res.signed,
        vendor_source: vendor.trim(),
        category_id: categoryId,
      }),
    );
    toast.success("Logged", {
      description: `${vendor.trim()} · ${formatCents(res.signed)}`,
    });
    setVendor("");
    setAmountStr("");
    setWarn(null);
  }

  return (
    <form
      onSubmit={submit}
      className="border-primary/15 bg-primary/[0.04] rounded-2xl border p-2"
    >
      <div className="grid grid-cols-2 items-center gap-1.5 sm:grid-cols-[8rem_1fr_9.5rem_6.5rem_auto]">
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Date"
          className="border-0 bg-transparent shadow-none focus-visible:ring-0"
        />
        <Input
          value={vendor}
          onChange={(e) => setVendor(e.target.value)}
          placeholder="What was it? (e.g. Blue Bottle)"
          aria-label="Payee or source"
          className="col-span-2 border-0 bg-transparent shadow-none focus-visible:ring-0 sm:col-span-1"
        />
        <Select
          value={categoryId}
          onValueChange={(v) => {
            setCategoryId(v);
            setWarn(null);
          }}
        >
          <SelectTrigger className="border-0 bg-transparent shadow-none focus-visible:ring-0">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            {active.length === 0 && (
              <SelectItem value="none" disabled>
                No categories
              </SelectItem>
            )}
            {active.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                <span
                  className="mr-0.5 size-2 rounded-full"
                  style={{ backgroundColor: categoryDotColor(c.id) }}
                />
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={amountStr}
          onChange={(e) => {
            setAmountStr(e.target.value);
            setWarn(null);
          }}
          placeholder="0.00"
          inputMode="decimal"
          aria-label="Amount"
          className="tnum border-0 bg-transparent text-right font-mono shadow-none focus-visible:ring-0"
        />
        <Button
          type="submit"
          size="icon"
          aria-label="Log transaction"
          className="justify-self-end rounded-xl"
        >
          <PlusIcon className="size-4" />
        </Button>
      </div>
      {warn && (
        <p className="px-2 pt-1 pb-0.5 text-xs text-amber-600 dark:text-amber-500">
          {warn}
        </p>
      )}
    </form>
  );
}
