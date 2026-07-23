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
  // The category's colour: null = the deterministic hue derived from the id at
  // render (M5, §10.1); a stored value is honoured if present. Not user-set in
  // the UI — the adjustable identity is `icon` (M11).
  color: z.string().nullable(),
  // null = the plain colour dot; non-null = a chosen Lucide icon name (its
  // PascalCase export name, e.g. "ShoppingCart"), resolved at render (M11, §10.1).
  icon: z.string().nullable(),
});
export type Category = z.infer<typeof CategorySchema>;

export function makeCategory(input: {
  name: string;
  type: CategoryType;
  id?: string;
  color?: string | null;
  icon?: string | null;
}): Category {
  return CategorySchema.parse({
    id: input.id ?? newId(),
    name: input.name,
    type: input.type,
    is_archived: false,
    color: input.color ?? null,
    icon: input.icon ?? null,
  });
}
