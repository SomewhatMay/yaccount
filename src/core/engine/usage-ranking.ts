import type { Category, Container, Transaction } from "../model";
import { activeRows } from "./ledger";

interface Usage {
  count: number;
  recent: string;
}

function touch(usage: Map<string, Usage>, id: string, row: Transaction): void {
  const recent = row.entered_at ?? `${row.date}T00:00:00.000Z`;
  const current = usage.get(id);
  usage.set(id, {
    count: (current?.count ?? 0) + 1,
    recent: current && current.recent > recent ? current.recent : recent,
  });
}

function rank<T extends { id: string }>(
  candidates: T[],
  usage: Map<string, Usage>,
  nameOf: (candidate: T) => string,
): T[] {
  return [...candidates].sort((a, b) => {
    const au = usage.get(a.id);
    const bu = usage.get(b.id);
    const count = (bu?.count ?? 0) - (au?.count ?? 0);
    if (count !== 0) return count;
    const recent = (bu?.recent ?? "").localeCompare(au?.recent ?? "");
    if (recent !== 0) return recent;
    const name = nameOf(a).localeCompare(nameOf(b));
    if (name !== 0) return name;
    return a.id.localeCompare(b.id);
  });
}

/** Rank only the candidates supplied; filtering/type/archive policy stays with the control. */
export function rankCategoriesByUsage(
  candidates: Category[],
  transactions: Transaction[],
): Category[] {
  const usage = new Map<string, Usage>();
  for (const row of activeRows(transactions)) {
    if (row.category_id) touch(usage, row.category_id, row);
  }
  return rank(candidates, usage, (category) => category.name);
}

/** Transfers count once at each endpoint; ordinary entries count their one container. */
export function rankContainersByUsage(
  candidates: Container[],
  transactions: Transaction[],
): Container[] {
  const usage = new Map<string, Usage>();
  for (const row of activeRows(transactions)) {
    touch(usage, row.container_id, row);
    if (row.to_container_id && row.to_container_id !== row.container_id) {
      touch(usage, row.to_container_id, row);
    }
  }
  return rank(candidates, usage, (container) => container.name);
}

/**
 * Known payees/funding sources, most-used first. Case and surrounding whitespace
 * do not split one name; the most recently used spelling wins.
 */
export function rankVendorSourcesByUsage(transactions: Transaction[]): string[] {
  const usage = new Map<string, Usage & { value: string }>();
  for (const row of activeRows(transactions)) {
    if (row.to_container_id) continue;
    const value = row.vendor_source.trim().normalize("NFC");
    if (!value) continue;
    const key = value.toLocaleLowerCase();
    const recent = row.entered_at ?? `${row.date}T00:00:00.000Z`;
    const current = usage.get(key);
    usage.set(key, {
      count: (current?.count ?? 0) + 1,
      recent: current && current.recent > recent ? current.recent : recent,
      value: !current || recent >= current.recent ? value : current.value,
    });
  }

  return [...usage.values()]
    .sort(
      (a, b) =>
        b.count - a.count ||
        b.recent.localeCompare(a.recent) ||
        a.value.localeCompare(b.value),
    )
    .map(({ value }) => value);
}

function shortcutShape(row: Transaction, template: boolean): string {
  return JSON.stringify([
    template && row.to_container_id ? -Math.abs(row.amount) : row.amount,
    row.vendor_source,
    row.category_id,
    row.container_id,
    row.to_container_id,
    row.notes,
  ]);
}

/**
 * Rank saved shortcuts by active entries matching what quick-log produces.
 * No shortcut ID is persisted on logged rows, so the complete logging shape is
 * the durable, recomputable link.
 */
export function rankShortcutsByUsage(
  shortcuts: Transaction[],
  transactions: Transaction[],
): Transaction[] {
  const byShape = new Map<string, string[]>();
  for (const shortcut of shortcuts) {
    const shape = shortcutShape(shortcut, true);
    byShape.set(shape, [...(byShape.get(shape) ?? []), shortcut.id]);
  }

  const usage = new Map<string, Usage>();
  for (const row of activeRows(transactions)) {
    for (const id of byShape.get(shortcutShape(row, false)) ?? []) {
      touch(usage, id, row);
    }
  }

  return rank(
    shortcuts,
    usage,
    (shortcut) => shortcut.template_name ?? shortcut.vendor_source,
  );
}
