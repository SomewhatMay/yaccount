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

function rank<T extends { id: string; name: string }>(
  candidates: T[],
  usage: Map<string, Usage>,
): T[] {
  return [...candidates].sort((a, b) => {
    const au = usage.get(a.id);
    const bu = usage.get(b.id);
    const count = (bu?.count ?? 0) - (au?.count ?? 0);
    if (count !== 0) return count;
    const recent = (bu?.recent ?? "").localeCompare(au?.recent ?? "");
    if (recent !== 0) return recent;
    const name = a.name.localeCompare(b.name);
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
  return rank(candidates, usage);
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
  return rank(candidates, usage);
}
