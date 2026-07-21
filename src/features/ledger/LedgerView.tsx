"use client";

import { useMemo, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { toast } from "sonner";
import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";
import {
  categoriesAtom,
  dispatchAtom,
  readyAtom,
  transactionsAtom,
} from "@/features/store";
import { voidTransaction } from "@/core/commands";
import { isLiveLedgerRow, containerBalance } from "@/core/engine/balances";
import { formatCents } from "@/core/money";
import { GENERAL_CONTAINER_ID, type Transaction } from "@/core/model";
import { cn } from "@/lib/utils";
import { categoryDotColor } from "@/features/category-color";
import { ComposeBar } from "@/features/ledger/ComposeBar";
import { EditTransactionSheet } from "@/features/ledger/EditTransactionSheet";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const thisMonth = (): string => new Date().toISOString().slice(0, 7);

const dayFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatDay(iso: string): string {
  const t = new Date();
  const todayIso = t.toISOString().slice(0, 10);
  const y = new Date(t.getTime() - 86400000).toISOString().slice(0, 10);
  if (iso === todayIso) return "Today";
  if (iso === y) return "Yesterday";
  return dayFormat.format(new Date(iso + "T00:00:00"));
}

export function LedgerView() {
  const ready = useAtomValue(readyAtom);
  const categories = useAtomValue(categoriesAtom);
  const transactions = useAtomValue(transactionsAtom);
  const dispatch = useSetAtom(dispatchAtom);
  const [editing, setEditing] = useState<Transaction | null>(null);

  const balance = useMemo(
    () => containerBalance(transactions, GENERAL_CONTAINER_ID),
    [transactions],
  );

  // This-month in/out for the general wallet — context for the balance, no chart.
  const { monthIn, monthOut } = useMemo(() => {
    const ym = thisMonth();
    let inSum = 0;
    let outSum = 0;
    for (const t of transactions) {
      if (!isLiveLedgerRow(t) || t.container_id !== GENERAL_CONTAINER_ID) continue;
      if (t.yearMonth !== ym) continue;
      if (t.amount >= 0) inSum += t.amount;
      else outSum += -t.amount;
    }
    return { monthIn: inSum, monthOut: outSum };
  }, [transactions]);

  const nameOf = useMemo(() => {
    const m = new Map(categories.map((c) => [c.id, c.name]));
    return (id: string | null) => (id ? (m.get(id) ?? "Unknown") : "Transfer");
  }, [categories]);

  // Void appends a reversing row linked via reverses_id; hide BOTH it and the
  // original it cancels (§0.3). Grouped by day, newest first.
  const groups = useMemo(() => {
    const voided = new Set<string>();
    for (const t of transactions) if (t.reverses_id) voided.add(t.reverses_id);
    const rows = transactions
      .filter((t) => !t.is_template && !t.reverses_id && !voided.has(t.id))
      .sort((a, b) =>
        a.date < b.date ? 1 : a.date > b.date ? -1 : a.id < b.id ? 1 : -1,
      );
    const out: { day: string; items: Transaction[] }[] = [];
    for (const t of rows) {
      const last = out[out.length - 1];
      if (last && last.day === t.date) last.items.push(t);
      else out.push({ day: t.date, items: [t] });
    }
    return out;
  }, [transactions]);

  async function del(t: Transaction) {
    await dispatch(voidTransaction(t));
    if (editing?.id === t.id) setEditing(null);
    toast.success("Deleted", {
      description: `${t.vendor_source} · ${formatCents(t.amount)}`,
    });
  }

  if (!ready) return <p className="text-muted-foreground py-16 text-sm">Loading…</p>;

  return (
    <div className="space-y-6">
      <section className="pt-3 pb-1">
        <p className="text-muted-foreground text-xs font-medium tracking-[0.18em] uppercase">
          Balance
        </p>
        <p
          className={cn(
            "font-display tnum mt-1 text-5xl leading-none sm:text-6xl",
            balance < 0 && "text-destructive",
          )}
        >
          {formatCents(balance)}
        </p>
        <div className="text-muted-foreground mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
          <span className="text-foreground/70 font-medium">This month</span>
          <span className="inline-flex items-center gap-1.5">
            <ArrowDownLeftIcon className="text-positive size-4" />
            <span className="tnum text-foreground font-mono">{formatCents(monthIn)}</span>
            in
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ArrowUpRightIcon className="size-4" />
            <span className="tnum text-foreground font-mono">
              {formatCents(monthOut)}
            </span>
            out
          </span>
        </div>
      </section>

      <ComposeBar
        categories={categories}
        onSubmit={async (op) => {
          await dispatch(op);
        }}
      />

      <div className="bg-card overflow-hidden rounded-2xl border">
        {groups.length === 0 ? (
          <div className="text-muted-foreground px-5 py-14 text-center text-sm">
            Nothing logged yet. Add your first entry above.
          </div>
        ) : (
          groups.map((g, gi) => (
            <div key={g.day} className={cn(gi > 0 && "border-t")}>
              <div className="text-muted-foreground bg-muted/30 px-5 py-1.5 text-xs font-medium">
                {formatDay(g.day)}
              </div>
              {g.items.map((t) => (
                <LedgerRow
                  key={t.id}
                  tx={t}
                  categoryName={nameOf(t.category_id)}
                  onEdit={() => setEditing(t)}
                  onDelete={() => del(t)}
                />
              ))}
            </div>
          ))
        )}
      </div>

      <EditTransactionSheet
        editing={editing}
        categories={categories}
        onOpenChange={(open) => !open && setEditing(null)}
        onSave={async (op) => {
          await dispatch(op);
          setEditing(null);
        }}
        onDelete={del}
      />
    </div>
  );
}

function LedgerRow({
  tx,
  categoryName,
  onEdit,
  onDelete,
}: {
  tx: Transaction;
  categoryName: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const income = tx.amount >= 0;
  return (
    <div className="group hover:bg-muted/40 flex items-center gap-3 px-5 py-3 transition-colors">
      <span
        className="size-2.5 shrink-0 rounded-full"
        style={{
          backgroundColor: tx.category_id ? categoryDotColor(tx.category_id) : undefined,
        }}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{tx.vendor_source}</div>
        <div className="text-muted-foreground truncate text-xs">{categoryName}</div>
      </div>
      <div
        className={cn("tnum font-mono text-sm tracking-tight", income && "text-positive")}
      >
        {formatCents(tx.amount)}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground size-8 rounded-lg opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
            aria-label="Transaction actions"
          >
            <MoreHorizontalIcon className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onEdit}>
            <PencilIcon className="size-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={onDelete}>
            <Trash2Icon className="size-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
