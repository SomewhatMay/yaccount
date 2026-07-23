"use client";

import { useMemo, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { toast } from "sonner";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  PencilIcon,
  PlusIcon,
  ShapesIcon,
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
import type { Category, CategoryType } from "@/core/model";
import { cn } from "@/lib/utils";
import { categoryDotColor } from "@/features/category-color";
import { BudgetSheet } from "@/features/categories/BudgetSheet";
import {
  activeCategoryFilterCount,
  applyCategoryFilter,
  isCategorySort,
  sortCategories,
  type BudgetState,
  type CategoryFilter,
  type CategorySort,
  type CategoryState,
} from "@/features/categories/filter";
import { useLocalPref } from "@/features/prefs";
import { FilterBar } from "@/features/FilterBar";
import { RenameField } from "@/features/RenameField";
import { nameTaken } from "@/features/unique-name";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { todayIso } from "@/features/clock";
import { CollapsibleSection, EmptyState, Eyebrow, RowActions } from "@/features/ui";

/** Device-local: how you like to READ the list, not a fact about your money. */
const SORT_KEY = "yaccount.categories.sort";

const SORT_OPTIONS = [
  { value: "name", label: "Name" },
  { value: "budget", label: "Budget" },
] as const;

const TYPES: { value: CategoryType; label: string }[] = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
];

const BUDGETS: { value: BudgetState; label: string }[] = [
  { value: "budgeted", label: "Has a budget" },
  { value: "unbudgeted", label: "No budget" },
];

const STATES: { value: CategoryState; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
];

interface CategoryDraft {
  text: string;
  types: CategoryType[];
  budgets: BudgetState[];
  states: CategoryState[];
}

const NO_FILTER: CategoryDraft = { text: "", types: [], budgets: [], states: [] };

export function CategoriesView() {
  const ready = useAtomValue(readyAtom);
  const categories = useAtomValue(categoriesAtom);
  const budgetTargets = useAtomValue(budgetTargetsAtom);
  const dispatch = useSetAtom(dispatchAtom);
  const [name, setName] = useState("");
  const [type, setType] = useState<CategoryType>("expense");
  const [budgeting, setBudgeting] = useState<Category | null>(null);

  // Sort is remembered; the filters are deliberately not (§12.4 M11).
  const [sort, setSort] = useLocalPref(SORT_KEY, "name", isCategorySort);
  const [draft, setDraft] = useState<CategoryDraft>(NO_FILTER);
  const filter: CategoryFilter = draft;
  const filtering = activeCategoryFilterCount(filter) > 0;

  // A budget is time-variant (§5.3) — a category has one *on a date*. Resolve it
  // once here for today, and the predicate and the row read the same figure.
  const budgetOf = useMemo(() => {
    const today = todayIso();
    return (c: Category) => budgetOnDate(budgetTargets, c.id, today);
  }, [budgetTargets]);

  const { expenses, incomes, archived } = useMemo(() => {
    const shown = sortCategories(
      applyCategoryFilter(categories, filter, { budget: budgetOf }),
      sort,
      { budget: budgetOf },
    );
    const active = shown.filter((c) => !c.is_archived);
    return {
      expenses: active.filter((c) => c.type === "expense"),
      incomes: active.filter((c) => c.type === "income"),
      archived: shown.filter((c) => c.is_archived),
    };
  }, [categories, filter, sort, budgetOf]);

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
        <h1 className="figure-lg">Categories</h1>
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

      {categories.length > 0 && (
        <FilterBar
          search={draft.text}
          onSearch={(text) => setDraft((d) => ({ ...d, text }))}
          searchPlaceholder="Search categories"
          facets={[
            {
              id: "type",
              label: "Type",
              selected: draft.types,
              onChange: (types) =>
                setDraft((d) => ({ ...d, types: types as CategoryType[] })),
              options: TYPES,
            },
            {
              id: "budget",
              label: "Budget",
              selected: draft.budgets,
              onChange: (budgets) =>
                setDraft((d) => ({ ...d, budgets: budgets as BudgetState[] })),
              options: BUDGETS,
            },
            {
              id: "state",
              label: "Status",
              selected: draft.states,
              onChange: (states) =>
                setDraft((d) => ({ ...d, states: states as CategoryState[] })),
              options: STATES,
            },
          ]}
          sort={{ value: sort, options: [...SORT_OPTIONS], onChange: setSort }}
          activeCount={activeCategoryFilterCount(filter)}
          onClear={() => setDraft(NO_FILTER)}
        />
      )}

      {categories.length === 0 ? (
        <div className="bg-card rounded-2xl border">
          <EmptyState icon={ShapesIcon} title="No categories yet">
            Add a few above for what your money does — groceries, rent, salary. Every
            entry you log is filed under one.
          </EmptyState>
        </div>
      ) : expenses.length === 0 && incomes.length === 0 && archived.length === 0 ? (
        <div className="bg-card rounded-2xl border">
          <EmptyState
            title="Nothing matches those filters"
            action={
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => setDraft(NO_FILTER)}
              >
                Clear filters
              </Button>
            }
          >
            {categories.length} categor{categories.length === 1 ? "y" : "ies"} — widen the
            filters to see them.
          </EmptyState>
        </div>
      ) : (
        <>
          {/* A section whose type was filtered out has nothing to say — the rail
              above already explains why the list is shorter. */}
          {(expenses.length > 0 || !filtering) && (
            <CategorySection
              title="Expenses"
              items={expenses}
              siblings={categories}
              budgetOf={budgetOf}
              sort={sort}
              onChange={dispatch}
              onBudget={setBudgeting}
            />
          )}
          {(incomes.length > 0 || !filtering) && (
            <CategorySection
              title="Income"
              items={incomes}
              siblings={categories}
              budgetOf={budgetOf}
              sort={sort}
              onChange={dispatch}
              onBudget={setBudgeting}
            />
          )}
        </>
      )}

      {/* Folded away by default (§12.4 M11 responsive density) — an archived
          category is out of every picker, so it is never why you opened this
          screen. The count and Restore stay reachable (§1.1). */}
      <CollapsibleSection
        title="Archived"
        count={archived.length}
        note="Hidden from pickers; old transactions still show their name. Restore any time."
      >
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
              <span className="text-muted-foreground flex-1 truncate text-sm">
                {c.name}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground h-8 shrink-0 rounded-lg"
                onClick={() => restore(c)}
              >
                <ArchiveRestoreIcon className="size-4" />
                Restore
              </Button>
            </div>
          ))}
        </div>
      </CollapsibleSection>

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
  budgetOf,
  sort,
  onChange,
  onBudget,
}: {
  title: string;
  items: Category[];
  siblings: Category[];
  budgetOf: (c: Category) => number | null;
  sort: CategorySort;
  onChange: (op: ReturnType<typeof updateCategory>) => Promise<void>;
  onBudget: (c: Category) => void;
}) {
  return (
    <section>
      <div className="text-muted-foreground mb-2 flex items-baseline justify-between px-1">
        <Eyebrow as="h2">{title}</Eyebrow>
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
              budget={budgetOf(c)}
              // Ranked by budget, the figure is what orders the list, so it has
              // to be on every row — including the ones with none to show.
              alwaysShowBudget={sort === "budget"}
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
  alwaysShowBudget,
  onChange,
  onBudget,
}: {
  category: Category;
  siblings: Category[];
  divider: boolean;
  budget: number | null;
  alwaysShowBudget: boolean;
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
        {budget !== null ? (
          <div className="text-muted-foreground truncate text-xs">
            {formatCents(budget)}/mo budget
          </div>
        ) : (
          alwaysShowBudget && (
            <div className="text-muted-foreground/70 truncate text-xs">no budget set</div>
          )
        )}
      </div>
      <RowActions label={`Actions for ${category.name}`}>
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
      </RowActions>
    </div>
  );
}
