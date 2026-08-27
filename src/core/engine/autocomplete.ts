import type { Category, Transaction } from "../model";
import { activeRows } from "./ledger";
import type { UsageFactLike } from "./usage-ranking";

export type CreationKind = "expense" | "income" | "transfer";
type VendorUsageSource = Transaction[] | UsageFactLike[];

function isUsageFacts(source: VendorUsageSource): source is UsageFactLike[] {
  return source.length > 0 && "kind" in source[0];
}

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
  transactions: VendorUsageSource,
  categories: Category[],
  kind: CreationKind,
  query: string,
): string[] {
  if (kind === "transfer") return [];
  const categoryKinds = new Map(
    categories.map((category) => [category.id, category.type]),
  );
  const usage = new Map<
    string,
    { value: string; count: number; recent: string; score: number }
  >();
  const normalizedQuery = normalize(query);

  if (isUsageFacts(transactions)) {
    for (const fact of transactions) {
      if (
        fact.kind !== "vendor" ||
        !fact.value ||
        !fact.categoryId ||
        categoryKinds.get(fact.categoryId) !== kind
      ) {
        continue;
      }
      const score = matchScore(fact.subject, normalizedQuery);
      if (!score) continue;
      const current = usage.get(fact.subject);
      usage.set(fact.subject, {
        value: !current || fact.recent >= current.recent ? fact.value : current.value,
        count: (current?.count ?? 0) + fact.count,
        recent:
          current && current.recent > fact.recent ? current.recent : fact.recent,
        score,
      });
    }
  } else {
    for (const row of activeRows(transactions)) {
      if (
        row.to_container_id ||
        !row.category_id ||
        categoryKinds.get(row.category_id) !== kind
      ) {
        continue;
      }
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
  transactions: VendorUsageSource,
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
  if (isUsageFacts(transactions)) {
    const match = transactions
      .filter(
        (fact) =>
          fact.kind === "vendor" &&
          fact.subject === key &&
          fact.categoryId !== undefined &&
          fact.containerId !== undefined &&
          categoryKinds.get(fact.categoryId) === kind,
      )
      .sort(
        (a, b) =>
          b.recent.localeCompare(a.recent) ||
          (b.recentId ?? "").localeCompare(a.recentId ?? ""),
      )[0];
    return match?.categoryId && match.containerId
      ? { categoryId: match.categoryId, containerId: match.containerId }
      : null;
  }
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
