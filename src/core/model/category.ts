import { z } from "zod";
import { zId, newId, zName } from "./primitives";

/** §5.1 categories */
export const CategoryTypeSchema = z.enum(["expense", "income"]);
export type CategoryType = z.infer<typeof CategoryTypeSchema>;

export const CategorySchema = z.object({
  id: zId,
  name: zName,
  type: CategoryTypeSchema,
  is_archived: z.boolean(), // soft-delete only (§5.5) — never hard-deleted
  // null = auto-assigned from the palette at render (M5); non-null = user override (M11).
  color: z.string().nullable(),
});
export type Category = z.infer<typeof CategorySchema>;

export function makeCategory(input: {
  name: string;
  type: CategoryType;
  id?: string;
  color?: string | null;
}): Category {
  return CategorySchema.parse({
    id: input.id ?? newId(),
    name: input.name,
    type: input.type,
    is_archived: false,
    color: input.color ?? null,
  });
}
