import type { Goal, Transaction } from "@/core/model";
import { isAchieved } from "@/core/engine";

export function reopenedGoal(next: Goal, txns: Transaction[]): Goal {
  if (next.status !== "completed" || next.kind === "reserve") return next;
  if (isAchieved(next, txns)) return next;
  return { ...next, status: "active", completed_date: null };
}
