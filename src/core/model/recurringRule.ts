import { z } from "zod";
import { zId, zIsoDate, zCents } from "./primitives";

/** §5.8 recurring_rules. */
export const FrequencySchema = z.enum([
  "daily",
  "weekly",
  "biweekly",
  "monthly",
  "annually",
  "custom",
]);
export type Frequency = z.infer<typeof FrequencySchema>;

export const AmountModeSchema = z.enum(["fixed", "goal_derived"]);
export type AmountMode = z.infer<typeof AmountModeSchema>;

export const RecurringRuleSchema = z.object({
  id: zId,
  frequency: FrequencySchema,
  // Shape depends on `frequency` (§5.8). M1 keeps it a preserved object; the
  // strict frequency↔config coupling + amount_mode↔template_amount rules are
  // encoded and tested by the recurring engine in M6 (their owning milestone).
  interval_config: z.record(z.string(), z.unknown()),
  template_amount: zCents.nullable(), // NOT NULL when amount_mode='fixed' (enforced M6)
  template_vendor_source: z.string().min(1),
  template_category_id: zId.nullable(), // null for transfer rules
  template_container_id: zId, // source / funding container
  template_to_container_id: zId.nullable(), // set only for transfer rules
  amount_mode: AmountModeSchema,
  linked_goal_id: zId.nullable(), // set when this rule is a goal auto-contribution
  start_date: zIsoDate,
  end_date: zIsoDate.nullable(), // null = indefinite
  next_generation_date: zIsoDate,
});
export type RecurringRule = z.infer<typeof RecurringRuleSchema>;
