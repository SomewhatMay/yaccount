import { z } from "zod";
import { zId, zIsoDate, zCents } from "./primitives";

/** §5.8 recurring_rules — scheduled generation of any of the three transaction shapes. */
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

/**
 * Lifecycle status. NOT in the spec §5.8 table — added M6 to honor the §1.1
 * reversibility invariant (cancelling a rule must be undoable, like archiving a
 * category/container). Same pattern as the M3 `settings` store: a documented,
 * invariant-driven extension, never a change to a locked decision. Defaults to
 * `active` so pre-M6 fixtures still parse.
 */
export const RuleStatusSchema = z.enum(["active", "cancelled"]);
export type RuleStatus = z.infer<typeof RuleStatusSchema>;

const zDayOfMonth = z.number().int().min(1).max(31); // clamped to the real month at generation
const zDayOfWeek = z.number().int().min(0).max(6); // 0 = Sunday … 6 = Saturday

/** `interval_config` shape per frequency (§5.8) — was a loose `z.record` in M1. */
export const DailyConfigSchema = z.object({});
export const WeeklyConfigSchema = z.object({ day_of_week: zDayOfWeek });
/** Biweekly = "twice a month" on two anchor days (e.g. 1st & 15th), NOT strict
 * every-14-days (§5.8) — a true 14-day cadence uses `custom` every 2 weeks. */
export const BiweeklyConfigSchema = z.object({
  days_of_month: z
    .tuple([zDayOfMonth, zDayOfMonth])
    .refine(([a, b]) => a < b, "the two anchor days must be distinct and ascending"),
});
export const MonthlyConfigSchema = z.object({ day_of_month: zDayOfMonth });
export const AnnuallyConfigSchema = z.object({
  month: z.number().int().min(1).max(12),
  day: zDayOfMonth,
});
export const CustomConfigSchema = z.object({
  every: z.number().int().min(1),
  unit: z.enum(["day", "week", "month", "year"]),
});

export type DailyConfig = z.infer<typeof DailyConfigSchema>;
export type WeeklyConfig = z.infer<typeof WeeklyConfigSchema>;
export type BiweeklyConfig = z.infer<typeof BiweeklyConfigSchema>;
export type MonthlyConfig = z.infer<typeof MonthlyConfigSchema>;
export type AnnuallyConfig = z.infer<typeof AnnuallyConfigSchema>;
export type CustomConfig = z.infer<typeof CustomConfigSchema>;
export type IntervalConfig =
  | DailyConfig
  | WeeklyConfig
  | BiweeklyConfig
  | MonthlyConfig
  | AnnuallyConfig
  | CustomConfig;

// The fields shared by every rule variant; each frequency then pins its own
// `interval_config` shape via a discriminated union on `frequency`.
const ruleBase = {
  id: zId,
  template_amount: zCents.nullable(), // NOT NULL when amount_mode='fixed' (refined below)
  template_vendor_source: z.string().min(1),
  template_category_id: zId.nullable(), // null for transfer rules
  template_container_id: zId, // source / funding container
  template_to_container_id: zId.nullable(), // set only for transfer rules
  amount_mode: AmountModeSchema,
  linked_goal_id: zId.nullable(), // set when this rule is a goal auto-contribution (M7)
  start_date: zIsoDate,
  end_date: zIsoDate.nullable(), // null = indefinite
  next_generation_date: zIsoDate, // cursor; the engine snaps it to the true grid
  status: RuleStatusSchema.default("active"),
};

export const RecurringRuleSchema = z
  .discriminatedUnion("frequency", [
    z.object({
      frequency: z.literal("daily"),
      interval_config: DailyConfigSchema,
      ...ruleBase,
    }),
    z.object({
      frequency: z.literal("weekly"),
      interval_config: WeeklyConfigSchema,
      ...ruleBase,
    }),
    z.object({
      frequency: z.literal("biweekly"),
      interval_config: BiweeklyConfigSchema,
      ...ruleBase,
    }),
    z.object({
      frequency: z.literal("monthly"),
      interval_config: MonthlyConfigSchema,
      ...ruleBase,
    }),
    z.object({
      frequency: z.literal("annually"),
      interval_config: AnnuallyConfigSchema,
      ...ruleBase,
    }),
    z.object({
      frequency: z.literal("custom"),
      interval_config: CustomConfigSchema,
      ...ruleBase,
    }),
  ])
  .refine((r) => r.amount_mode !== "fixed" || r.template_amount !== null, {
    // A fixed-amount rule must know the amount to log; a goal_derived rule
    // recomputes it at generation time (§5.9.5), so its template_amount may be null.
    message: "a fixed-amount rule needs template_amount",
    path: ["template_amount"],
  })
  .refine((r) => r.template_category_id !== null || r.template_to_container_id !== null, {
    // A rule is either an expense/income (has a category) or a transfer (has a
    // destination). Neither ⇒ we can't tell what shape to generate.
    message:
      "a rule needs either a category (expense/income) or a destination (transfer)",
    path: ["template_category_id"],
  });
export type RecurringRule = z.infer<typeof RecurringRuleSchema>;

/**
 * Build a recurring rule (§5.8). `next_generation_date` defaults to `start_date`;
 * the generation engine snaps that cursor to the first real occurrence, so a
 * start date that isn't itself an occurrence (e.g. day-of-month 15 with a start
 * on the 1st) still generates correctly. `status` defaults to active.
 */
export function makeRecurringRule(input: {
  frequency: Frequency;
  interval_config: IntervalConfig;
  template_vendor_source: string;
  template_container_id: string;
  start_date: string;
  id?: string;
  template_amount?: number | null;
  template_category_id?: string | null;
  template_to_container_id?: string | null;
  amount_mode?: AmountMode;
  linked_goal_id?: string | null;
  end_date?: string | null;
  next_generation_date?: string;
  status?: RuleStatus;
}): RecurringRule {
  return RecurringRuleSchema.parse({
    id: input.id ?? crypto.randomUUID(),
    frequency: input.frequency,
    interval_config: input.interval_config,
    template_amount: input.template_amount ?? null,
    template_vendor_source: input.template_vendor_source,
    template_category_id: input.template_category_id ?? null,
    template_container_id: input.template_container_id,
    template_to_container_id: input.template_to_container_id ?? null,
    amount_mode: input.amount_mode ?? "fixed",
    linked_goal_id: input.linked_goal_id ?? null,
    start_date: input.start_date,
    end_date: input.end_date ?? null,
    next_generation_date: input.next_generation_date ?? input.start_date,
    status: input.status ?? "active",
  });
}

/** True for a transfer rule (§5.4 transfer shape: a destination, no category). */
export function isTransferRule(rule: RecurringRule): boolean {
  return rule.template_to_container_id !== null;
}
