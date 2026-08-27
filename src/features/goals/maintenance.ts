import { cancelRecurringRule, completeGoal, updateGoal } from "@/core/commands";
import { isAchieved } from "@/core/engine";
import type { Goal, RecurringRule, Transaction } from "@/core/model";
import type { Op } from "@/core/oplog";

/** Goal status changes implied by corrected approved contribution history. */
export function goalMaintenanceOps(
  goals: Goal[],
  transactions: Transaction[],
  rules: RecurringRule[],
  today: string,
): Op[] {
  const ops: Op[] = [];
  for (const goal of goals) {
    if (goal.status === "active" && isAchieved(goal, transactions)) {
      ops.push(completeGoal(goal.id, today));
      for (const rule of rules) {
        if (rule.linked_goal_id === goal.id && rule.status === "active") {
          ops.push(cancelRecurringRule(rule.id));
        }
      }
      continue;
    }
    if (
      goal.status === "completed" &&
      goal.kind === "spend_down" &&
      !isAchieved(goal, transactions)
    ) {
      ops.push(updateGoal({ ...goal, status: "active", completed_date: null }));
    }
  }
  return ops;
}
