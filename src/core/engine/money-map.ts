import type { Container, ContainerSnapshot, Goal, Transaction } from "../model";
import { containerBalance } from "./balances";

export type MoneyMapBranchKind = "counted" | "goals" | "investments" | "other";

export interface MoneyMapItem {
  containerId: string;
  name: string;
  value: number | null;
  valuation: "ledger" | "snapshot" | "unvalued";
  snapshotDate: string | null;
  isInvestment: boolean;
  goalNames: string[];
}

export interface MoneyMapBranch {
  kind: MoneyMapBranchKind;
  knownValue: number;
  unvaluedCount: number;
  items: MoneyMapItem[];
}

export interface MoneyMap {
  knownTrackedValue: number;
  unvaluedCount: number;
  branches: MoneyMapBranch[];
}

const BRANCH_ORDER: MoneyMapBranchKind[] = ["counted", "goals", "investments", "other"];

function latestSnapshot(
  snapshots: readonly ContainerSnapshot[],
  containerId: string,
): ContainerSnapshot | null {
  let latest: ContainerSnapshot | null = null;
  for (const snapshot of snapshots) {
    if (snapshot.container_id !== containerId) continue;
    if (
      !latest ||
      snapshot.date > latest.date ||
      (snapshot.date === latest.date && snapshot.id > latest.id)
    ) {
      latest = snapshot;
    }
  }
  return latest;
}

/** Current tracked value split into mutually exclusive job-based branches. */
export function moneyMap(
  containers: readonly Container[],
  snapshots: readonly ContainerSnapshot[],
  ledgerTransactions: Transaction[],
  goals: readonly Goal[],
): MoneyMap {
  const activeGoals = new Map<string, Goal[]>();
  for (const goal of goals) {
    if (goal.status !== "active" || goal.is_archived) continue;
    const existing = activeGoals.get(goal.container_id) ?? [];
    existing.push(goal);
    activeGoals.set(goal.container_id, existing);
  }

  const grouped = new Map<MoneyMapBranchKind, MoneyMapItem[]>(
    BRANCH_ORDER.map((kind) => [kind, []]),
  );
  for (const container of containers) {
    if (container.is_archived) continue;
    const containerGoals = activeGoals.get(container.id) ?? [];
    const kind: MoneyMapBranchKind = container.include_in_overall_balance
      ? "counted"
      : containerGoals.length > 0
        ? "goals"
        : container.is_investment
          ? "investments"
          : "other";

    // Counted containers must use the exact overall-balance identity even when
    // they also carry a goal or investment flag. Every other investment uses
    // its externally reported value.
    const snapshot =
      container.is_investment && kind !== "counted"
        ? latestSnapshot(snapshots, container.id)
        : null;
    const item: MoneyMapItem = {
      containerId: container.id,
      name: container.name,
      value:
        container.is_investment && kind !== "counted"
          ? (snapshot?.reported_balance ?? null)
          : containerBalance(ledgerTransactions, container.id),
      valuation:
        container.is_investment && kind !== "counted"
          ? snapshot
            ? "snapshot"
            : "unvalued"
          : "ledger",
      snapshotDate: snapshot?.date ?? null,
      isInvestment: container.is_investment,
      goalNames: containerGoals
        .map((goal) => goal.name ?? container.name)
        .sort((a, b) => a.localeCompare(b)),
    };
    grouped.get(kind)!.push(item);
  }

  const branches = BRANCH_ORDER.map((kind) => {
    const items = grouped
      .get(kind)!
      .sort(
        (a, b) =>
          a.name.localeCompare(b.name) || a.containerId.localeCompare(b.containerId),
      );
    return {
      kind,
      knownValue: items.reduce((sum, item) => sum + (item.value ?? 0), 0),
      unvaluedCount: items.filter((item) => item.value === null).length,
      items,
    };
  });
  return {
    knownTrackedValue: branches.reduce((sum, branch) => sum + branch.knownValue, 0),
    unvaluedCount: branches.reduce((sum, branch) => sum + branch.unvaluedCount, 0),
    branches,
  };
}
