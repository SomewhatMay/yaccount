"use client";

import { useMemo, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { toast } from "sonner";
import { ArchiveIcon, MoreHorizontalIcon, PencilIcon, PlusIcon } from "lucide-react";
import { categoriesAtom, dispatchAtom, readyAtom } from "@/features/store";
import { createCategory, updateCategory, archiveCategory } from "@/core/commands";
import type { Category, CategoryType } from "@/core/model";
import { cn } from "@/lib/utils";
import { categoryDotColor } from "@/features/category-color";
import { RenameField } from "@/features/RenameField";
import { nameTaken } from "@/features/unique-name";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function CategoriesView() {
  const ready = useAtomValue(readyAtom);
  const categories = useAtomValue(categoriesAtom);
  const dispatch = useSetAtom(dispatchAtom);
  const [name, setName] = useState("");
  const [type, setType] = useState<CategoryType>("expense");

  const { expenses, incomes, archivedCount } = useMemo(() => {
    const active = categories
      .filter((c) => !c.is_archived)
      .sort((a, b) => a.name.localeCompare(b.name));
    return {
      expenses: active.filter((c) => c.type === "expense"),
      incomes: active.filter((c) => c.type === "income"),
      archivedCount: categories.length - active.length,
    };
  }, [categories]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return toast.error("Name the category.");
    if (nameTaken(categories, trimmed)) {
      return toast.error("You already have a category with that name.");
    }
    await dispatch(createCategory({ name: trimmed, type }));
    toast.success("Category added", { description: `${trimmed} · ${type}` });
    setName("");
  }

  if (!ready) return <p className="text-muted-foreground py-16 text-sm">Loading…</p>;

  return (
    <div className="space-y-6">
      <section className="pt-3 pb-1">
        <h1 className="font-display text-3xl leading-none">Categories</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          What your money does. Rename or archive anytime — old transactions keep their
          label.
        </p>
      </section>

      <form
        onSubmit={add}
        className="border-primary/15 bg-primary/[0.04] rounded-2xl border p-2"
      >
        <div className="grid grid-cols-2 items-center gap-1.5 sm:grid-cols-[1fr_9rem_auto]">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name a category (e.g. Groceries)"
            aria-label="Category name"
            className="col-span-2 border-0 bg-transparent shadow-none focus-visible:ring-0 sm:col-span-1"
          />
          <Select value={type} onValueChange={(v) => setType(v as CategoryType)}>
            <SelectTrigger className="border-0 bg-transparent shadow-none focus-visible:ring-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="expense">Expense</SelectItem>
              <SelectItem value="income">Income</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="submit"
            size="icon"
            aria-label="Add category"
            className="justify-self-end rounded-xl"
          >
            <PlusIcon className="size-4" />
          </Button>
        </div>
      </form>

      <CategorySection
        title="Expenses"
        items={expenses}
        siblings={categories}
        onChange={dispatch}
      />
      <CategorySection
        title="Income"
        items={incomes}
        siblings={categories}
        onChange={dispatch}
      />

      {archivedCount > 0 && (
        <p className="text-muted-foreground text-xs">
          {archivedCount} archived — hidden from pickers, still resolve on old
          transactions.
        </p>
      )}
    </div>
  );
}

function CategorySection({
  title,
  items,
  siblings,
  onChange,
}: {
  title: string;
  items: Category[];
  siblings: Category[];
  onChange: (op: ReturnType<typeof updateCategory>) => Promise<void>;
}) {
  return (
    <section>
      <div className="text-muted-foreground mb-2 flex items-baseline justify-between px-1">
        <h2 className="text-xs font-medium tracking-[0.14em] uppercase">{title}</h2>
        <span className="tnum font-mono text-xs">{items.length}</span>
      </div>
      <div className="bg-card overflow-hidden rounded-2xl border">
        {items.length === 0 ? (
          <div className="text-muted-foreground px-5 py-8 text-center text-sm">
            No {title.toLowerCase()} categories yet.
          </div>
        ) : (
          items.map((c, i) => (
            <CategoryRow
              key={c.id}
              category={c}
              siblings={siblings}
              divider={i > 0}
              onChange={onChange}
            />
          ))
        )}
      </div>
    </section>
  );
}

function CategoryRow({
  category,
  siblings,
  divider,
  onChange,
}: {
  category: Category;
  siblings: Category[];
  divider: boolean;
  onChange: (op: ReturnType<typeof updateCategory>) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);

  async function save(name: string) {
    if (name !== category.name) {
      await onChange(updateCategory({ ...category, name }));
      toast.success("Renamed", { description: name });
    }
    setEditing(false);
  }

  async function archive() {
    await onChange(archiveCategory(category.id));
    toast.success("Archived", { description: category.name });
  }

  return (
    <div
      className={cn(
        "group hover:bg-muted/40 flex items-center gap-3 px-5 py-3 transition-colors",
        divider && "border-t",
      )}
    >
      <span
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: categoryDotColor(category.id) }}
        aria-hidden
      />
      {editing ? (
        <RenameField
          value={category.name}
          label={`Rename ${category.name}`}
          validate={(next) =>
            nameTaken(siblings, next, category.id) ? "That name is taken." : null
          }
          onSave={save}
          onCancel={() => setEditing(false)}
          className="flex-1"
        />
      ) : (
        <span className="flex-1 text-sm font-medium">{category.name}</span>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground size-8 rounded-lg opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
            aria-label="Category actions"
          >
            <MoreHorizontalIcon className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditing(true)}>
            <PencilIcon className="size-4" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onClick={archive}>
            <ArchiveIcon className="size-4" />
            Archive
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
