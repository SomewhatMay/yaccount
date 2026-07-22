import { format } from "date-fns";
import type { Goal } from "@/core/model";
import { formatCents } from "@/core/money";

/** A one-line human summary of a goal's plan (§5.9.4), for list rows. */
export function describeGoal(goal: Goal): string {
  const kind = goal.kind === "reserve" ? "Reserve" : "Savings";
  switch (goal.mode) {
    case "deadline": {
      const by = goal.deadline
        ? format(new Date(`${goal.deadline}T00:00:00`), "MMM yyyy")
        : "—";
      return `${kind} · by ${by}`;
    }
    case "fixed":
      return `${kind} · ${formatCents(goal.planned_monthly ?? 0)}/mo`;
    case "passive":
      return `${kind} · tracking`;
  }
}
