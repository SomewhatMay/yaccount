import { z } from "zod";
import { zId, zIsoDate, zCentsNonNeg, newId } from "./primitives";

/** §5.3 budget_targets — time-variant, no end_date. Unique per
 * (category_id, start_date); `budgetTarget.set` upserts by that natural key (M4). */
export const BudgetTargetSchema = z.object({
  id: zId,
  category_id: zId,
  amount: zCentsNonNeg, // integer cents, >= 0
  start_date: zIsoDate, // effective until the next row for the same category
});
export type BudgetTarget = z.infer<typeof BudgetTargetSchema>;

/** Set a category's budget effective from a date (§5.3). A row for the same
 * (category_id, start_date) upserts rather than stacking a duplicate. */
export function makeBudgetTarget(input: {
  category_id: string;
  amount: number; // integer cents, >= 0
  start_date: string;
  id?: string;
}): BudgetTarget {
  return BudgetTargetSchema.parse({
    id: input.id ?? newId(),
    category_id: input.category_id,
    amount: input.amount,
    start_date: input.start_date,
  });
}
