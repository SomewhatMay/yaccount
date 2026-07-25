import { createCategory, type OpMeta } from "@/core/commands";
import { newId, type Category, type CategoryType } from "@/core/model";
import type { Op } from "@/core/oplog";
import { nameTaken } from "@/features/unique-name";

export interface StarterCategory {
  readonly key: string;
  readonly name: string;
  readonly type: CategoryType;
  readonly icon: string;
}

const DEFINITIONS: StarterCategory[] = [
  { key: "housing", name: "Housing", type: "expense", icon: "House" },
  { key: "groceries", name: "Groceries", type: "expense", icon: "ShoppingCart" },
  { key: "dining", name: "Dining", type: "expense", icon: "Utensils" },
  { key: "transport", name: "Transport", type: "expense", icon: "Car" },
  { key: "utilities", name: "Utilities", type: "expense", icon: "Zap" },
  { key: "health", name: "Health", type: "expense", icon: "HeartPulse" },
  { key: "shopping", name: "Shopping", type: "expense", icon: "ShoppingBag" },
  { key: "entertainment", name: "Entertainment", type: "expense", icon: "Clapperboard" },
  { key: "subscriptions", name: "Subscriptions", type: "expense", icon: "Repeat" },
  { key: "giving", name: "Giving", type: "expense", icon: "HandHeart" },
  { key: "travel", name: "Travel", type: "expense", icon: "Plane" },
  { key: "other", name: "Other", type: "expense", icon: "Shapes" },
  { key: "paycheck", name: "Paycheck", type: "income", icon: "Banknote" },
  { key: "other-income", name: "Other income", type: "income", icon: "CircleDollarSign" },
];

export const STARTER_CATEGORIES: readonly StarterCategory[] = Object.freeze(
  DEFINITIONS.map((item) => Object.freeze(item)),
);

export const DEFAULT_STARTER_KEYS = Object.freeze(
  STARTER_CATEGORIES.map((item) => item.key),
);

export function buildStarterCategoryOps(
  selectedKeys: ReadonlySet<string>,
  existing: Category[],
  makeId: () => string = newId,
  makeMeta?: () => OpMeta,
): Extract<Op, { type: "category.create" }>[] {
  if (selectedKeys.size === 0) throw new Error("Select a category.");
  const known = new Set(STARTER_CATEGORIES.map((item) => item.key));
  const unknown = [...selectedKeys].filter((key) => !known.has(key)).sort();
  if (unknown.length) throw new Error(`Unknown starter category: ${unknown.join(", ")}`);

  const selected = STARTER_CATEGORIES.filter((item) => selectedKeys.has(item.key));
  const duplicate = selected.find((item) => nameTaken(existing, item.name));
  if (duplicate) throw new Error(`${duplicate.name} already exists.`);

  return selected.map((item) =>
    createCategory(
      { name: item.name, type: item.type, icon: item.icon, id: makeId() },
      makeMeta?.(),
    ),
  );
}
