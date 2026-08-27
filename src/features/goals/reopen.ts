import type { Goal } from "@/core/model";
import { isAchieved, type GoalLedgerInput } from "@/core/engine";

export function reopenedGoal(next: Goal, txns: GoalLedgerInput): Goal {
  if (next.status !== "completed" || next.kind === "reserve") return next;
  if (isAchieved(next, txns)) return next;
  return { ...next, status: "active", completed_date: null };
}
