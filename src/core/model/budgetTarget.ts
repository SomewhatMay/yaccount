import { z } from "zod";
import { zId, zIsoDate, zCentsNonNeg } from "./primitives";

/** §5.3 budget_targets — time-variant, no end_date. Unique per
 * (category_id, start_date); `budgetTarget.set` upserts by that natural key (M4). */
export const BudgetTargetSchema = z.object({
  id: zId,
  category_id: zId,
  amount: zCentsNonNeg, // integer cents, >= 0
  start_date: zIsoDate, // effective until the next row for the same category
});
export type BudgetTarget = z.infer<typeof BudgetTargetSchema>;
