import { z } from "zod";
import { zId, newId } from "./primitives";

/** The default wallet, auto-seeded on first init (§5.2). Fixed id so multiple
 * fresh devices converge on one wallet instead of minting duplicates. */
export const GENERAL_CONTAINER_ID = "general";

/** §5.2 containers */
export const ContainerSchema = z.object({
  id: zId,
  name: z.string().min(1),
  is_investment: z.boolean(),
  // opt-in, default exclude (§5.7) — only 'general' defaults true.
  include_in_overall_balance: z.boolean(),
  is_archived: z.boolean(), // soft-delete only (§5.5)
});
export type Container = z.infer<typeof ContainerSchema>;

export function makeContainer(input: {
  name: string;
  id?: string;
  is_investment?: boolean;
  include_in_overall_balance?: boolean;
}): Container {
  return ContainerSchema.parse({
    id: input.id ?? newId(),
    name: input.name,
    is_investment: input.is_investment ?? false,
    include_in_overall_balance: input.include_in_overall_balance ?? false,
    is_archived: false,
  });
}

/** The seeded 'general' wallet: opted into overall balance (§5.2/§5.7). */
export function makeGeneralContainer(): Container {
  return ContainerSchema.parse({
    id: GENERAL_CONTAINER_ID,
    name: "General",
    is_investment: false,
    include_in_overall_balance: true,
    is_archived: false,
  });
}
