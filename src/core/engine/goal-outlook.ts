import type { Container, Goal, Transaction } from "../model";
import {
  goalBasis,
  goalProgress,
  projectedCompletion,
  requiredMonthly,
  requiresReplan,
} from "./goals";

export type GoalOutlookStatus = "on-track" | "needs-change" | "passive";

export interface GoalOutlookRow {
  goalId: string;
  containerId: string;
  name: string;
  kind: Goal["kind"];
  mode: Goal["mode"];
  basis: number;
  target: number | null;
  progress: number | null;
  monthlyAsk: number;
  deadline: string | null;
  projectedCompletion: string | null;
  requiresReplan: boolean;
  status: GoalOutlookStatus;
}

export interface GoalOutlook {
  rows: GoalOutlookRow[];
  totalMonthly: number;
  counts: { onTrack: number; needsChange: number; passive: number };
}

/** Active goal finish lines using the same basis, ask, and projection engines as Goals. */
export function goalOutlook(
  goals: Goal[],
  containers: Container[],
  transactions: Transaction[],
  today: string,
): GoalOutlook {
  const containerName = new Map(
    containers.map((container) => [container.id, container.name]),
  );
  const rows = goals
    .filter((goal) => goal.status === "active" && !goal.is_archived)
    .map((goal): GoalOutlookRow => {
      const basis = goalBasis(goal, transactions);
      const monthlyAsk = requiredMonthly(goal, transactions, today);
      const replan = requiresReplan(goal, transactions, today);
      const projection = projectedCompletion(goal, transactions, today);
      const stalledFixed =
        goal.mode === "fixed" &&
        goal.target_amount !== null &&
        basis < goal.target_amount &&
        projection === null;
      const status: GoalOutlookStatus =
        goal.mode === "passive"
          ? "passive"
          : replan || stalledFixed
            ? "needs-change"
            : "on-track";
      return {
        goalId: goal.id,
        containerId: goal.container_id,
        name: goal.name ?? containerName.get(goal.container_id) ?? "Goal",
        kind: goal.kind,
        mode: goal.mode,
        basis,
        target: goal.target_amount,
        progress: goalProgress(goal, transactions),
        monthlyAsk,
        deadline: goal.deadline,
        projectedCompletion: projection,
        requiresReplan: replan,
        status,
      };
    });

  const statusRank: Record<GoalOutlookStatus, number> = {
    "needs-change": 0,
    "on-track": 1,
    passive: 2,
  };
  rows.sort(
    (a, b) =>
      statusRank[a.status] - statusRank[b.status] ||
      (a.deadline ?? a.projectedCompletion ?? "9999-12-31").localeCompare(
        b.deadline ?? b.projectedCompletion ?? "9999-12-31",
      ) ||
      a.name.localeCompare(b.name) ||
      a.goalId.localeCompare(b.goalId),
  );

  return {
    rows,
    totalMonthly: rows.reduce((sum, row) => sum + row.monthlyAsk, 0),
    counts: {
      onTrack: rows.filter((row) => row.status === "on-track").length,
      needsChange: rows.filter((row) => row.status === "needs-change").length,
      passive: rows.filter((row) => row.status === "passive").length,
    },
  };
}
