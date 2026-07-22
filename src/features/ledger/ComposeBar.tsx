"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowRightIcon, PlusIcon } from "lucide-react";
import { createTransaction, createTransfer } from "@/core/commands";
import { formatCents, parseDollars } from "@/core/money";
import type { Category, Container } from "@/core/model";
import {
  defaultSign,
  resolveAmount,
  splitSign,
  type Sign,
} from "@/features/ledger/amount";
import { SignToggle } from "@/features/ledger/SignToggle";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { todayIso } from "@/features/clock";

type Mode = "entry" | "transfer";

export function ComposeBar({
  categories,
  containers,
  defaultContainerId,
  onSubmit,
}: {
  categories: Category[];
  containers: Container[];
  defaultContainerId: string;
  onSubmit: (op: ReturnType<typeof createTransaction>) => Promise<void>;
}) {
  const activeCategories = useMemo(
    () =>
      categories
        .filter((c) => !c.is_archived)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [categories],
  );
  const activeContainers = useMemo(
    () => containers.filter((c) => !c.is_archived),
    [containers],
  );

  const [mode, setMode] = useState<Mode>("entry");
  const [date, setDate] = useState(todayIso());
  const [vendor, setVendor] = useState("");
  const [categoryId, setCategoryId] = useState(activeCategories[0]?.id ?? "");
  // Null = "follow the Default Spending Container" (§5.2); a pick overrides it.
  const [pickedContainerId, setPickedContainerId] = useState<string | null>(null);
  const containerId = pickedContainerId ?? defaultContainerId;
  const [toContainerId, setToContainerId] = useState("");
  const [amountStr, setAmountStr] = useState("");
  // Null = follow the category's usual direction; a tap (or a typed +/−) pins it.
  const [pickedSign, setPickedSign] = useState<Sign | null>(null);
  const [warn, setWarn] = useState<string | null>(null);

  const cat = categories.find((c) => c.id === categoryId);
  const sign: Sign = pickedSign ?? defaultSign(cat?.type ?? "expense");
  const from = containers.find((c) => c.id === containerId);
  const to = containers.find((c) => c.id === toContainerId);

  async function submitTransfer() {
    if (!from || !to) return toast.error("Pick where the money goes.");
    if (from.id === to.id) return toast.error("Pick two different containers.");
    let magnitude: number;
    try {
      magnitude = Math.abs(parseDollars(amountStr));
    } catch {
      return toast.error("Enter a valid amount.");
    }
    if (magnitude === 0) return toast.error("Amount can't be zero.");

    await onSubmit(
      createTransfer({
        date,
        amount: magnitude,
        container_id: from.id,
        to_container_id: to.id,
        fromName: from.name,
        toName: to.name,
        vendor_source: vendor.trim() || undefined,
      }),
    );
    toast.success("Moved", {
      description: `${formatCents(magnitude)} · ${from.name} → ${to.name}`,
    });
    reset();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!from) return toast.error("Pick a container.");
    if (mode === "transfer") return submitTransfer();

    if (!vendor.trim()) return toast.error("Add a payee or source.");
    if (!cat) return toast.error("Add a category first.");

    const res = resolveAmount(amountStr, cat.type, sign);
    if (!res.ok) return toast.error(res.error);

    // Inline confirm on an unusual sign — arm once, commit on the next submit.
    if (res.unusual && warn === null) {
      setWarn(
        `${formatCents(res.signed)} is money ${sign === "+" ? "in" : "out"} on a ${cat.type} category — looks like a ${cat.type === "expense" ? "refund or rebate" : "clawback"}. Add again to confirm.`,
      );
      return;
    }

    await onSubmit(
      createTransaction({
        date,
        amount: res.signed,
        vendor_source: vendor.trim(),
        category_id: categoryId,
        container_id: from.id,
      }),
    );
    toast.success("Logged", {
      description: `${vendor.trim()} · ${formatCents(res.signed)} · ${from.name}`,
    });
    reset();
  }

  function reset() {
    setVendor("");
    setAmountStr("");
    setPickedSign(null);
    setWarn(null);
  }

  // A typed leading +/− moves into the sign control so it is never a silent no-op.
  function onAmountChange(raw: string) {
    const { sign: typed, rest } = splitSign(raw);
    if (typed) setPickedSign(typed);
    setAmountStr(rest);
    setWarn(null);
  }

  return (
    <form
      onSubmit={submit}
      className="border-primary/15 bg-primary/[0.04] space-y-1.5 rounded-2xl border p-2"
    >
      <div className="grid grid-cols-[auto_1fr] items-center gap-1.5 sm:grid-cols-[8.5rem_1fr_auto_6rem_auto]">
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
          placeholder={
            mode === "transfer" ? "Note (optional)" : "What was it? (e.g. Blue Bottle)"
          }
          aria-label={mode === "transfer" ? "Transfer note" : "Payee or source"}
          className="col-span-2 border-0 bg-transparent shadow-none focus-visible:ring-0 sm:col-span-1"
        />
        {mode === "entry" ? (
          <SignToggle
            sign={sign}
            onChange={(next) => {
              setPickedSign(next);
              setWarn(null);
            }}
            className="justify-self-end"
          />
        ) : (
          <span aria-hidden />
        )}
        <Input
          value={amountStr}
          onChange={(e) => onAmountChange(e.target.value)}
          placeholder="0.00"
          inputMode="decimal"
          aria-label="Amount"
          className="tnum border-0 bg-transparent text-right font-mono shadow-none focus-visible:ring-0"
        />
        <Button
          type="submit"
          size="icon"
          aria-label={mode === "transfer" ? "Move money" : "Log transaction"}
          className="justify-self-end rounded-xl"
        >
          <PlusIcon className="size-4" />
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(v) => {
            if (!v) return;
            setMode(v as Mode);
            setWarn(null);
          }}
          className="bg-background/60 rounded-full border-0 p-0.5"
        >
          <ToggleGroupItem
            value="entry"
            aria-label={cat?.type === "income" ? "Log income" : "Log an expense"}
            className="data-[state=on]:bg-primary/10 data-[state=on]:text-primary h-7 rounded-full px-3 text-xs"
          >
            {cat?.type === "income" ? "Income" : "Expense"}
          </ToggleGroupItem>
          <ToggleGroupItem
            value="transfer"
            aria-label="Move money between containers"
            className="data-[state=on]:bg-primary/10 data-[state=on]:text-primary h-7 rounded-full px-3 text-xs"
          >
            Transfer
          </ToggleGroupItem>
        </ToggleGroup>

        {mode === "entry" && (
          <Select
            value={categoryId}
            onValueChange={(v) => {
              setCategoryId(v);
              setWarn(null);
            }}
          >
            <SelectTrigger
              aria-label="Category"
              className="hover:bg-background/70 h-8 w-auto max-w-44 min-w-32 rounded-full border-0 bg-transparent px-3 shadow-none focus-visible:ring-0"
            >
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              {activeCategories.length === 0 && (
                <SelectItem value="none" disabled>
                  No categories
                </SelectItem>
              )}
              {activeCategories.map((c) => (
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
        )}

        <ContainerSelect
          value={containerId}
          onChange={setPickedContainerId}
          containers={activeContainers}
          label={mode === "transfer" ? "From container" : "Container"}
        />

        {mode === "transfer" && (
          <>
            <ArrowRightIcon className="text-muted-foreground size-3.5" aria-hidden />
            <ContainerSelect
              value={toContainerId}
              onChange={setToContainerId}
              containers={activeContainers.filter((c) => c.id !== containerId)}
              label="To container"
              placeholder="To…"
            />
          </>
        )}
      </div>

      {warn && (
        <p className="px-2 pt-1 pb-0.5 text-xs text-amber-600 dark:text-amber-500">
          {warn}
        </p>
      )}
    </form>
  );
}

function ContainerSelect({
  value,
  onChange,
  containers,
  label,
  placeholder = "Container",
}: {
  value: string;
  onChange: (v: string) => void;
  containers: Container[];
  label: string;
  placeholder?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        aria-label={label}
        className="hover:bg-background/70 h-8 w-auto max-w-44 min-w-32 rounded-full border-0 bg-transparent px-3 shadow-none focus-visible:ring-0"
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {containers.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
