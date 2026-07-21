import { z } from "zod";
import { zId, zIsoDate, zCents, zCentsNonNeg } from "./primitives";

/** §5.9.2 goals — a purpose + plan layered onto a container. */
export const GoalKindSchema = z.enum(["spend_down", "reserve"]);
export type GoalKind = z.infer<typeof GoalKindSchema>;

export const GoalModeSchema = z.enum(["deadline", "fixed", "passive"]);
export type GoalMode = z.infer<typeof GoalModeSchema>;

export const GoalStatusSchema = z.enum(["active", "completed", "cancelled"]);
export type GoalStatus = z.infer<typeof GoalStatusSchema>;

export const GoalSchema = z.object({
  id: zId,
  container_id: zId,
  name: z.string().nullable(), // defaults to container name at creation (cycle label)
  kind: GoalKindSchema,
  mode: GoalModeSchema,
  target_amount: zCentsNonNeg.nullable(),
  deadline: zIsoDate.nullable(),
  planned_monthly: zCentsNonNeg.nullable(),
  // Head-start basis; may be a (possibly negative) absorbed container balance (§5.9.6).
  opening_contributed: zCents,
  status: GoalStatusSchema,
  is_archived: z.boolean(),
  created_date: zIsoDate,
  completed_date: zIsoDate.nullable(),
});
export type Goal = z.infer<typeof GoalSchema>;

// NOTE: the cross-field integrity rules (mode='deadline' ⇒ deadline+target set;
// mode='fixed' ⇒ planned_monthly set; kind='reserve' ⇒ target set; etc., §5.9.2/.4)
// are encoded and tested against the spec's worked examples in M7 (goals' owning
// milestone), not here — M1 only fixes the field types and enum CHECK constraints.
