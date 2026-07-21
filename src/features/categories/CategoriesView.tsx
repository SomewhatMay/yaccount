"use client";

import { useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { categoriesAtom, dispatchAtom, readyAtom } from "@/features/store";
import { createCategory, updateCategory, archiveCategory } from "@/core/commands";
import type { Category, CategoryType } from "@/core/model";

export function CategoriesView() {
  const ready = useAtomValue(readyAtom);
  const categories = useAtomValue(categoriesAtom);
  const dispatch = useSetAtom(dispatchAtom);
  const [name, setName] = useState("");
  const [type, setType] = useState<CategoryType>("expense");

  const active = categories
    .filter((c) => !c.is_archived)
    .sort((a, b) => a.name.localeCompare(b.name));
  const archived = categories.filter((c) => c.is_archived);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    await dispatch(createCategory({ name: trimmed, type }));
    setName("");
  }

  if (!ready) return <p className="p-6 text-sm opacity-60">Loading…</p>;

  return (
    <section className="mx-auto max-w-2xl p-6">
      <h2 className="mb-4 text-lg font-semibold tracking-tight">Categories</h2>

      <form onSubmit={add} className="mb-6 flex flex-wrap gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Category name"
          className="flex-1 rounded border border-black/15 px-3 py-1.5 text-sm dark:border-white/20"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value as CategoryType)}
          className="rounded border border-black/15 px-2 py-1.5 text-sm dark:border-white/20"
        >
          <option value="expense">Expense</option>
          <option value="income">Income</option>
        </select>
        <button
          type="submit"
          className="rounded bg-black px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          Add
        </button>
      </form>

      <ul className="divide-y divide-black/10 dark:divide-white/10">
        {active.map((c) => (
          <CategoryRow key={c.id} category={c} onChange={dispatch} />
        ))}
        {active.length === 0 && (
          <li className="py-3 text-sm opacity-60">No categories yet.</li>
        )}
      </ul>

      {archived.length > 0 && (
        <p className="mt-6 text-xs opacity-50">
          {archived.length} archived (hidden from pickers, still resolve on old
          transactions).
        </p>
      )}
    </section>
  );
}

function CategoryRow({
  category,
  onChange,
}: {
  category: Category;
  onChange: (op: ReturnType<typeof updateCategory>) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(category.name);

  async function save() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== category.name) {
      await onChange(updateCategory({ ...category, name: trimmed }));
    }
    setEditing(false);
  }

  return (
    <li className="flex items-center gap-3 py-2.5 text-sm">
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => e.key === "Enter" && save()}
          className="flex-1 rounded border border-black/15 px-2 py-1 dark:border-white/20"
        />
      ) : (
        <span className="flex-1">{category.name}</span>
      )}
      <span className="rounded bg-black/5 px-2 py-0.5 text-xs opacity-70 dark:bg-white/10">
        {category.type}
      </span>
      <button
        onClick={() => (editing ? save() : setEditing(true))}
        className="text-xs underline opacity-70 hover:opacity-100"
      >
        {editing ? "Save" : "Rename"}
      </button>
      <button
        onClick={() => onChange(archiveCategory(category.id))}
        className="text-xs underline opacity-70 hover:opacity-100"
      >
        Archive
      </button>
    </li>
  );
}
