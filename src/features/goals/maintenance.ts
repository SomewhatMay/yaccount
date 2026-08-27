import { cancelRecurringRule, completeGoal, updateGoal } from "@/core/commands";
import { isAchieved, type GoalLedgerFacts } from "@/core/engine";
import type { Goal, RecurringRule, Transaction } from "@/core/model";
import type { Op } from "@/core/oplog";

/** Goal status changes implied by corrected approved contribution history. */
export function goalMaintenanceOps(
  goals: Goal[],
  transactions: Transaction[] | ReadonlyMap<string, GoalLedgerFacts>,
  rules: RecurringRule[],
  today: string,
): Op[] {
  const ops: Op[] = [];
  for (const goal of goals) {
    const ledger = Array.isArray(transactions)
      ? transactions
      : (transactions.get(goal.id) ?? { balance: 0, netContribution: 0 });
    if (goal.status === "active" && isAchieved(goal, ledger)) {
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
      !isAchieved(goal, ledger)
    ) {
      ops.push(updateGoal({ ...goal, status: "active", completed_date: null }));
    }
  }
  return ops;
}
