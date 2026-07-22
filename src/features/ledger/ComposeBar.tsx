"use client";

import { ArrowRightIcon, PlusIcon } from "lucide-react";
import type { Category, Container } from "@/core/model";
import { useComposeFields } from "@/features/ledger/useComposeFields";
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

/**
 * The compose bar (§12.4): a borderless, iris-tinted line pinned above the
 * register where you write. The one sanctioned iris wash in the language — it
 * marks the place you write, and the recipe is not copied onto anything else.
 *
 * The fields and the rules behind them are `useComposeFields`, shared with the
 * quick-add sheet, so the two surfaces cannot drift apart.
 */
export function ComposeBar({
  categories,
  containers,
  defaultContainerId,
}: {
  categories: Category[];
  containers: Container[];
  defaultContainerId: string;
}) {
  const f = useComposeFields({ categories, containers, defaultContainerId });
  const transfer = f.kind === "transfer";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void f.submit();
      }}
      className="border-primary/15 bg-primary/[0.04] space-y-1.5 rounded-2xl border p-2"
    >
      <div className="grid grid-cols-[auto_1fr] items-center gap-1.5 sm:grid-cols-[13rem_1fr_auto_6rem_auto]">
        <Input
          type="datetime-local"
          value={f.when}
          onChange={(e) => f.setWhen(e.target.value)}
          aria-label="Date and time"
          className="tnum border-0 bg-transparent shadow-none focus-visible:ring-0"
        />
        <Input
          value={f.vendor}
          onChange={(e) => f.setVendor(e.target.value)}
          placeholder={transfer ? "Note (optional)" : "What was it? (e.g. Blue Bottle)"}
          aria-label={transfer ? "Transfer note" : "Payee or source"}
          className="col-span-2 border-0 bg-transparent shadow-none focus-visible:ring-0 sm:col-span-1"
        />
        {transfer ? (
          <span aria-hidden />
        ) : (
          <SignToggle sign={f.sign} onChange={f.setSign} className="justify-self-end" />
        )}
        <Input
          value={f.amountStr}
          onChange={(e) => f.onAmountChange(e.target.value)}
          placeholder="0.00"
          inputMode="decimal"
          aria-label="Amount"
          className="tnum border-0 bg-transparent text-right font-mono shadow-none focus-visible:ring-0"
        />
        <Button
          type="submit"
          size="icon"
          aria-label={transfer ? "Move money" : "Log transaction"}
          className="justify-self-end rounded-xl"
        >
          <PlusIcon className="size-4" />
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <ToggleGroup
          type="single"
          value={transfer ? "transfer" : "entry"}
          onValueChange={(v) => {
            if (!v) return;
            // "Entry" means whatever the chosen category already is: the kind is
            // not a mode you set here, it is what you filed the row under.
            f.setKind(v === "transfer" ? "transfer" : (f.category?.type ?? "expense"));
          }}
          className="bg-background/60 rounded-full border-0 p-0.5"
        >
          <ToggleGroupItem
            value="entry"
            aria-label={f.kind === "income" ? "Log income" : "Log an expense"}
            className="data-[state=on]:bg-primary/10 data-[state=on]:text-primary h-7 rounded-full px-3 text-xs"
          >
            {f.kind === "income" ? "Income" : "Expense"}
          </ToggleGroupItem>
          <ToggleGroupItem
            value="transfer"
            aria-label="Move money between containers"
            className="data-[state=on]:bg-primary/10 data-[state=on]:text-primary h-7 rounded-full px-3 text-xs"
          >
            Transfer
          </ToggleGroupItem>
        </ToggleGroup>

        {!transfer && (
          <Select value={f.categoryId} onValueChange={f.setCategoryId}>
            <SelectTrigger
              aria-label="Category"
              className="hover:bg-background/70 h-8 w-auto max-w-44 min-w-32 rounded-full border-0 bg-transparent px-3 shadow-none focus-visible:ring-0"
            >
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              {f.activeCategories.length === 0 && (
                <SelectItem value="none" disabled>
                  No categories
                </SelectItem>
              )}
              {f.activeCategories.map((c) => (
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
          value={f.containerId}
          onChange={f.setPickedContainerId}
          containers={f.activeContainers}
          label={transfer ? "From container" : "Container"}
        />

        {transfer && (
          <>
            <ArrowRightIcon className="text-muted-foreground size-3.5" aria-hidden />
            <ContainerSelect
              value={f.toContainerId}
              onChange={f.setToContainerId}
              containers={f.activeContainers.filter((c) => c.id !== f.containerId)}
              label="To container"
              placeholder="To…"
            />
          </>
        )}
      </div>

      {f.warn && (
        <p className="px-2 pt-1 pb-0.5 text-xs text-amber-600 dark:text-amber-500">
          {f.warn}
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
