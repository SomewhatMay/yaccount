"use client";

import { useMemo, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { categoriesAtom, dispatchAtom, readyAtom, transactionsAtom } from "@/features/store";
import { createTransaction, updateTransaction, voidTransaction } from "@/core/commands";
import { containerBalance } from "@/core/engine/balances";
import { formatCents, parseDollars } from "@/core/money";
import { GENERAL_CONTAINER_ID, type Category, type Transaction } from "@/core/model";

const today = (): string => new Date().toISOString().slice(0, 10);

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

  // Resolve category names for EVERY category incl. archived, so old rows still
  // read correctly (§5.5) even after their category leaves the pickers.
  const nameOf = useMemo(() => {
    const m = new Map(categories.map((c) => [c.id, c.name]));
    return (id: string | null) => (id ? (m.get(id) ?? "(unknown)") : "—");
  }, [categories]);

  // A void appends a reversing row and links it via reverses_id; hide BOTH the
  // reversing row and the original it cancels (§0.3). Balance still counts them.
  const visible = useMemo(() => {
    const voided = new Set<string>();
    for (const t of transactions) if (t.reverses_id) voided.add(t.reverses_id);
    return transactions
      .filter((t) => !t.is_template && !t.reverses_id && !voided.has(t.id))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.id < b.id ? 1 : -1));
  }, [transactions]);

  if (!ready) return <p className="p-6 text-sm opacity-60">Loading…</p>;

  return (
    <section className="mx-auto max-w-2xl p-6">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-wide opacity-50">General balance</p>
        <p
          className={`text-3xl font-semibold tabular-nums ${balance < 0 ? "text-red-600 dark:text-red-400" : ""}`}
        >
          {formatCents(balance)}
        </p>
      </div>

      <TransactionForm
        key={editing?.id ?? "new"}
        categories={categories}
        editing={editing}
        onCancel={() => setEditing(null)}
        onSubmit={async (op) => {
          await dispatch(op);
          setEditing(null);
        }}
      />

      <ul className="mt-6 divide-y divide-black/10 dark:divide-white/10">
        {visible.map((t) => (
          <li key={t.id} className="flex items-center gap-3 py-2.5 text-sm">
            <span className="w-24 shrink-0 tabular-nums opacity-60">{t.date}</span>
            <span className="flex-1 truncate">
              {t.vendor_source}
              <span className="ml-2 text-xs opacity-50">{nameOf(t.category_id)}</span>
            </span>
            <span
              className={`w-24 shrink-0 text-right tabular-nums ${t.amount < 0 ? "" : "text-green-700 dark:text-green-400"}`}
            >
              {formatCents(t.amount)}
            </span>
            <button
              onClick={() => setEditing(t)}
              className="text-xs underline opacity-70 hover:opacity-100"
            >
              Edit
            </button>
            <button
              onClick={() => dispatch(voidTransaction(t))}
              className="text-xs underline opacity-70 hover:opacity-100"
            >
              Delete
            </button>
          </li>
        ))}
        {visible.length === 0 && (
          <li className="py-3 text-sm opacity-60">No transactions yet.</li>
        )}
      </ul>
    </section>
  );
}

function TransactionForm({
  categories,
  editing,
  onSubmit,
  onCancel,
}: {
  categories: Category[];
  editing: Transaction | null;
  onSubmit: (op: ReturnType<typeof createTransaction>) => Promise<void>;
  onCancel: () => void;
}) {
  const active = useMemo(
    () =>
      categories
        .filter((c) => !c.is_archived)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [categories],
  );

  const [date, setDate] = useState(editing?.date ?? today());
  const [vendor, setVendor] = useState(editing?.vendor_source ?? "");
  const [categoryId, setCategoryId] = useState(editing?.category_id ?? active[0]?.id ?? "");
  // Show the magnitude; the sign is applied by category type on submit.
  const [amountStr, setAmountStr] = useState(
    editing ? formatCents(Math.abs(editing.amount)).replace("$", "") : "",
  );
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmedVendor = vendor.trim();
    if (!trimmedVendor) return setError("Enter a payee / source.");
    if (!categoryId) return setError("Add a category first.");

    const cat = categories.find((c) => c.id === categoryId);
    if (!cat) return setError("Category not found.");

    let parsed: number;
    try {
      parsed = parseDollars(amountStr);
    } catch {
      return setError("Enter a valid amount.");
    }
    if (parsed === 0) return setError("Amount can't be zero.");

    // Auto-sign by category type; keep an explicit sign the user typed. Confirm
    // on an unusual sign (soft rule §10 #13) — opposite signs stay allowed.
    const explicit = amountStr.trim().startsWith("-") || amountStr.trim().startsWith("+");
    const magnitude = Math.abs(parsed);
    const signed = explicit ? parsed : cat.type === "expense" ? -magnitude : magnitude;
    const unusual = cat.type === "expense" ? signed > 0 : signed < 0;
    if (unusual) {
      const ok = window.confirm(
        `That's a ${signed > 0 ? "positive" : "negative"} amount on a ${cat.type} category (e.g. a refund/void). Save anyway?`,
      );
      if (!ok) return;
    }

    if (editing) {
      await onSubmit(
        updateTransaction({
          ...editing,
          date,
          amount: signed,
          vendor_source: trimmedVendor,
          category_id: categoryId,
          yearMonth: date.slice(0, 7),
        }),
      );
    } else {
      await onSubmit(
        createTransaction({
          date,
          amount: signed,
          vendor_source: trimmedVendor,
          category_id: categoryId,
        }),
      );
    }
    setVendor("");
    setAmountStr("");
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-black/10 p-4 dark:border-white/15">
      <div className="flex flex-wrap gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded border border-black/15 px-2 py-1.5 text-sm dark:border-white/20"
        />
        <input
          value={vendor}
          onChange={(e) => setVendor(e.target.value)}
          placeholder="Payee / source"
          className="min-w-40 flex-1 rounded border border-black/15 px-3 py-1.5 text-sm dark:border-white/20"
        />
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="rounded border border-black/15 px-2 py-1.5 text-sm dark:border-white/20"
        >
          {active.length === 0 && <option value="">No categories</option>}
          {active.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.type})
            </option>
          ))}
        </select>
        <input
          value={amountStr}
          onChange={(e) => setAmountStr(e.target.value)}
          placeholder="0.00"
          inputMode="decimal"
          className="w-28 rounded border border-black/15 px-3 py-1.5 text-right text-sm tabular-nums dark:border-white/20"
        />
        <button
          type="submit"
          className="rounded bg-black px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          {editing ? "Save" : "Add"}
        </button>
        {editing && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded px-3 py-1.5 text-sm underline opacity-70"
          >
            Cancel
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </form>
  );
}
