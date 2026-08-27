import { z } from "zod";
import { newId, zCents, zId, zIsoDate, zIsoDateTime, zName } from "./primitives";

/** A choice not to spend. It is motivational history, never a ledger amount. */
export const CravingWinSchema = z
  .object({
    id: zId,
    description: zName,
    amount_kept: zCents.min(1),
    date: zIsoDate,
    occurred_at: zIsoDateTime,
    category_id: zId.nullable(),
    reflection: z.string().trim().min(1).nullable(),
    goal_id: zId.nullable(),
    transfer_transaction_id: zId.nullable(),
  })
  .refine((win) => (win.goal_id === null) === (win.transfer_transaction_id === null), {
    message: "a goal link and transfer link must be present together",
    path: ["transfer_transaction_id"],
  });

export type CravingWin = z.infer<typeof CravingWinSchema>;

export function makeCravingWin(input: {
  description: string;
  amount_kept: number;
  date: string;
  occurred_at: string;
  id?: string;
  category_id?: string | null;
  reflection?: string | null;
  goal_id?: string | null;
  transfer_transaction_id?: string | null;
}): CravingWin {
  return CravingWinSchema.parse({
    id: input.id ?? newId(),
    description: input.description,
    amount_kept: input.amount_kept,
    date: input.date,
    occurred_at: input.occurred_at,
    category_id: input.category_id ?? null,
    reflection: input.reflection?.trim() || null,
    goal_id: input.goal_id ?? null,
    transfer_transaction_id: input.transfer_transaction_id ?? null,
  });
}
