"use client";

import { useMemo, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { toast } from "sonner";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  TargetIcon,
} from "lucide-react";
import {
  budgetTargetsAtom,
  categoriesAtom,
  dispatchAtom,
  readyAtom,
} from "@/features/store";
import {
  createCategory,
  updateCategory,
  archiveCategory,
  unarchiveCategory,
} from "@/core/commands";
import { budgetOnDate } from "@/core/engine/budgets";
import { formatCents } from "@/core/money";
import type { BudgetTarget, Category, CategoryType } from "@/core/model";
import { cn } from "@/lib/utils";
import { categoryDotColor } from "@/features/category-color";
import { BudgetSheet } from "@/features/categories/BudgetSheet";
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
import { todayIso } from "@/features/clock";

export function CategoriesView() {
  const ready = useAtomValue(readyAtom);
  const categories = useAtomValue(categoriesAtom);
  const budgetTargets = useAtomValue(budgetTargetsAtom);
  const dispatch = useSetAtom(dispatchAtom);
  const [name, setName] = useState("");
  const [type, setType] = useState<CategoryType>("expense");
  const [budgeting, setBudgeting] = useState<Category | null>(null);

  const { expenses, incomes, archived } = useMemo(() => {
    const byName = (a: Category, b: Category) => a.name.localeCompare(b.name);
    const active = categories.filter((c) => !c.is_archived).sort(byName);
    return {
      expenses: active.filter((c) => c.type === "expense"),
      incomes: active.filter((c) => c.type === "income"),
      archived: categories.filter((c) => c.is_archived).sort(byName),
    };
  }, [categories]);

  async function restore(c: Category) {
    await dispatch(unarchiveCategory(c.id));
    toast.success("Restored", { description: c.name });
  }

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
        budgetTargets={budgetTargets}
        onChange={dispatch}
        onBudget={setBudgeting}
      />
      <CategorySection
        title="Income"
        items={incomes}
        siblings={categories}
        budgetTargets={budgetTargets}
        onChange={dispatch}
        onBudget={setBudgeting}
      />

      {archived.length > 0 && (
        <section>
          <div className="text-muted-foreground mb-2 flex items-baseline justify-between px-1">
            <h2 className="text-xs font-medium tracking-[0.14em] uppercase">Archived</h2>
            <span className="tnum font-mono text-xs">{archived.length}</span>
          </div>
          <div className="bg-card/50 overflow-hidden rounded-2xl border border-dashed">
            {archived.map((c, i) => (
              <div
                key={c.id}
                className={cn(
                  "group hover:bg-muted/40 flex items-center gap-3 px-5 py-2.5 transition-colors",
                  i > 0 && "border-t border-dashed",
                )}
              >
                <span
                  className="size-2.5 shrink-0 rounded-full opacity-50"
                  style={{ backgroundColor: categoryDotColor(c.id) }}
                  aria-hidden
                />
                <span className="text-muted-foreground flex-1 text-sm">{c.name}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground h-8 rounded-lg"
                  onClick={() => restore(c)}
                >
                  <ArchiveRestoreIcon className="size-4" />
                  Restore
                </Button>
              </div>
            ))}
          </div>
          <p className="text-muted-foreground mt-2 px-1 text-xs">
            Hidden from pickers; old transactions still show their name. Restore any time.
          </p>
        </section>
      )}

      <BudgetSheet
        category={budgeting}
        budgetTargets={budgetTargets}
        onOpenChange={(open) => !open && setBudgeting(null)}
        onDispatch={dispatch}
      />
    </div>
  );
}

function CategorySection({
  title,
  items,
  siblings,
  budgetTargets,
  onChange,
  onBudget,
}: {
  title: string;
  items: Category[];
  siblings: Category[];
  budgetTargets: BudgetTarget[];
  onChange: (op: ReturnType<typeof updateCategory>) => Promise<void>;
  onBudget: (c: Category) => void;
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
              budget={budgetOnDate(budgetTargets, c.id, todayIso())}
              onChange={onChange}
              onBudget={() => onBudget(c)}
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
  budget,
  onChange,
  onBudget,
}: {
  category: Category;
  siblings: Category[];
  divider: boolean;
  budget: number | null;
  onChange: (op: ReturnType<typeof updateCategory>) => Promise<void>;
  onBudget: () => void;
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
    toast.success("Archived", {
      description: category.name,
      action: {
        label: "Undo",
        onClick: () => {
          void onChange(unarchiveCategory(category.id)).then(() =>
            toast.success("Restored", { description: category.name }),
          );
        },
      },
    });
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
      <div className="min-w-0 flex-1">
        {editing ? (
          <RenameField
            value={category.name}
            label={`Rename ${category.name}`}
            validate={(next) =>
              nameTaken(siblings, next, category.id) ? "That name is taken." : null
            }
            onSave={save}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <span className="truncate text-sm font-medium">{category.name}</span>
        )}
        {budget !== null && (
          <div className="text-muted-foreground truncate text-xs">
            {formatCents(budget)}/mo budget
          </div>
        )}
      </div>
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
          <DropdownMenuItem onClick={onBudget}>
            <TargetIcon className="size-4" />
            Budget
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
