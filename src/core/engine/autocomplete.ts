import type { Category, Transaction } from "../model";
import { activeRows } from "./ledger";

export type CreationKind = "expense" | "income" | "transfer";

function normalize(value: string): string {
  return value.trim().normalize("NFC").toLocaleLowerCase();
}

function matchScore(value: string, query: string): number {
  if (!query) return 1;
  if (value === query) return 3;
  if (value.startsWith(query)) return 2;
  return value.includes(query) ? 1 : 0;
}

export function rankAutocompleteOptions<T extends { label: string }>(
  options: T[],
  query: string,
): T[] {
  const normalizedQuery = normalize(query);
  return options
    .map((option, index) => ({
      option,
      index,
      score: matchScore(normalize(option.label), normalizedQuery),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ option }) => option);
}

export function rankVendorSourcesForKind(
  transactions: Transaction[],
  categories: Category[],
  kind: CreationKind,
  query: string,
): string[] {
  const categoryKinds = new Map(
    categories.map((category) => [category.id, category.type]),
  );
  const usage = new Map<
    string,
    { value: string; count: number; recent: string; score: number }
  >();
  const normalizedQuery = normalize(query);

  for (const row of activeRows(transactions)) {
    const matchesKind =
      kind === "transfer"
        ? row.to_container_id !== null
        : row.to_container_id === null &&
          row.category_id !== null &&
          categoryKinds.get(row.category_id) === kind;
    if (!matchesKind) continue;
    const value = row.vendor_source.trim().normalize("NFC");
    const key = normalize(value);
    if (!key) continue;
    const score = matchScore(key, normalizedQuery);
    if (!score) continue;
    const recent = row.entered_at ?? `${row.date}T00:00:00.000Z`;
    const current = usage.get(key);
    usage.set(key, {
      value: !current || recent >= current.recent ? value : current.value,
      count: (current?.count ?? 0) + 1,
      recent: current && current.recent > recent ? current.recent : recent,
      score,
    });
  }

  return [...usage.values()]
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.count - a.count ||
        b.recent.localeCompare(a.recent) ||
        a.value.localeCompare(b.value),
    )
    .map(({ value }) => value);
}

export function recallVendorSelection(
  transactions: Transaction[],
  categories: Category[],
  kind: CreationKind,
  value: string,
): { categoryId: string; containerId: string } | null {
  if (kind === "transfer") return null;
  const key = normalize(value);
  if (!key) return null;
  const categoryKinds = new Map(
    categories.map((category) => [category.id, category.type]),
  );
  const match = activeRows(transactions)
    .filter(
      (row) =>
        !row.to_container_id &&
        row.category_id &&
        categoryKinds.get(row.category_id) === kind &&
        normalize(row.vendor_source) === key,
    )
    .sort((a, b) => {
      const recentA = a.entered_at ?? `${a.date}T00:00:00.000Z`;
      const recentB = b.entered_at ?? `${b.date}T00:00:00.000Z`;
      return recentB.localeCompare(recentA) || b.id.localeCompare(a.id);
    })[0];

  return match?.category_id
    ? { categoryId: match.category_id, containerId: match.container_id }
    : null;
}
