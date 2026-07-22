import { z } from "zod";
import { zId, zIsoDate, zCents, zCentsNonNeg, newId } from "./primitives";

/** §5.9.2 goals — a purpose + plan layered onto a container. */
export const GoalKindSchema = z.enum(["spend_down", "reserve"]);
export type GoalKind = z.infer<typeof GoalKindSchema>;

export const GoalModeSchema = z.enum(["deadline", "fixed", "passive"]);
export type GoalMode = z.infer<typeof GoalModeSchema>;

export const GoalStatusSchema = z.enum(["active", "completed", "cancelled"]);
export type GoalStatus = z.infer<typeof GoalStatusSchema>;

export const GoalSchema = z
  .object({
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
  })
  // Cross-field integrity (§5.9.2/.4). `mode` holds one quantity fixed and lets
  // the other flex — so each mode pins which fields must (not) be present.
  .refine((g) => g.mode !== "deadline" || g.deadline !== null, {
    message: "a deadline goal needs a deadline",
    path: ["deadline"],
  })
  .refine((g) => g.mode !== "deadline" || g.target_amount !== null, {
    // the date is sacred, the ask flexes — but the ask is `(target − basis)/months`,
    // so a target is required to compute it.
    message: "a deadline goal needs a target",
    path: ["target_amount"],
  })
  .refine((g) => g.mode !== "fixed" || g.planned_monthly !== null, {
    message: "a fixed goal needs a committed monthly amount",
    path: ["planned_monthly"],
  })
  .refine((g) => g.mode === "fixed" || g.planned_monthly === null, {
    // deadline derives its ask; passive claims nothing — neither stores M (§5.9.4).
    message: "planned_monthly is only meaningful in fixed mode",
    path: ["planned_monthly"],
  })
  .refine((g) => g.kind !== "reserve" || g.target_amount !== null, {
    // a reserve is a set-point (progress = balance/target), so it needs a target.
    message: "a reserve goal needs a target",
    path: ["target_amount"],
  });
export type Goal = z.infer<typeof GoalSchema>;

/**
 * Build a goal (§5.9.2). `name` defaults to null (the UI shows the container
 * name); `status` active, `opening_contributed` 0, `is_archived` false. The
 * cross-field refinements above reject an incoherent mode/kind combination.
 */
export function makeGoal(input: {
  container_id: string;
  kind: GoalKind;
  mode: GoalMode;
  created_date: string;
  id?: string;
  name?: string | null;
  target_amount?: number | null;
  deadline?: string | null;
  planned_monthly?: number | null;
  opening_contributed?: number;
  status?: GoalStatus;
  is_archived?: boolean;
  completed_date?: string | null;
}): Goal {
  return GoalSchema.parse({
    id: input.id ?? newId(),
    container_id: input.container_id,
    name: input.name ?? null,
    kind: input.kind,
    mode: input.mode,
    target_amount: input.target_amount ?? null,
    deadline: input.deadline ?? null,
    planned_monthly: input.planned_monthly ?? null,
    opening_contributed: input.opening_contributed ?? 0,
    status: input.status ?? "active",
    is_archived: input.is_archived ?? false,
    created_date: input.created_date,
    completed_date: input.completed_date ?? null,
  });
}
