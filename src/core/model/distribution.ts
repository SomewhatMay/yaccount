import { z } from "zod";
import { newId, zId, zName } from "./primitives";

/**
 * A named income-distribution preset (plans/income-distribution.md).
 *
 * Not a table: each preset rides the synced `settings` store under its own key,
 * so concurrent edits to two different presets never collide (settings are
 * entity-LWW by key) and no new op type is needed — an older client that
 * doesn't know about presets still replays these as ordinary settings and
 * converges on the same state.
 *
 * Shares are integer basis points (1% = 100 bps) so the split stays exact
 * integer math. Every part names a container; the `rest` container takes
 * whatever the parts leave, plus every rounding cent.
 */
export const BPS_WHOLE = 10_000;

export const DISTRIBUTION_KEY_PREFIX = "distribution:";
/** The preset compose falls back to when nothing in a category's history says
 * otherwise. Value is a preset id; "" = none. */
export const DISTRIBUTION_DEFAULT_KEY = "distribution_default";

export const distributionKey = (id: string): string => `${DISTRIBUTION_KEY_PREFIX}${id}`;
export const isDistributionKey = (key: string): boolean =>
  key.startsWith(DISTRIBUTION_KEY_PREFIX);

export const DistributionPartSchema = z.object({
  container_id: zId,
  bps: z.number().int().min(1).max(BPS_WHOLE),
});
export type DistributionPart = z.infer<typeof DistributionPartSchema>;

export const DistributionPresetSchema = z
  .object({
    v: z.literal(1),
    id: zId,
    name: zName,
    rest_container_id: zId,
    parts: z.array(DistributionPartSchema),
    // A preset is archived, never removed: `settings` has no remove op, and a
    // soft delete must stay restorable (§1.1).
    archived: z.boolean(),
  })
  .refine((p) => p.parts.reduce((sum, part) => sum + part.bps, 0) <= BPS_WHOLE, {
    message: "the parts add up to more than 100%",
    path: ["parts"],
  })
  .refine((p) => p.parts.every((part) => part.container_id !== p.rest_container_id), {
    message: "the rest container takes what is left — it can't also be a part",
    path: ["parts"],
  })
  .refine(
    (p) => new Set(p.parts.map((part) => part.container_id)).size === p.parts.length,
    {
      message: "each container can appear only once",
      path: ["parts"],
    },
  );
export type DistributionPreset = z.infer<typeof DistributionPresetSchema>;

export function makeDistributionPreset(input: {
  name: string;
  rest_container_id: string;
  parts: DistributionPart[];
  id?: string;
  archived?: boolean;
}): DistributionPreset {
  return DistributionPresetSchema.parse({
    v: 1,
    id: input.id ?? newId(),
    name: input.name,
    rest_container_id: input.rest_container_id,
    parts: input.parts,
    archived: input.archived ?? false,
  });
}

/** The share the rest container takes before rounding. */
export function restBps(preset: DistributionPreset): number {
  return BPS_WHOLE - preset.parts.reduce((sum, part) => sum + part.bps, 0);
}

export function serializeDistributionPreset(preset: DistributionPreset): string {
  return JSON.stringify(preset);
}

/**
 * Read a preset from its setting value. Tolerant by design: a value written by a
 * future client or mangled by hand is skipped, never thrown on — a merge must
 * never throw, and one bad preset must not hide the rest.
 */
export function parseDistributionPreset(value: string): DistributionPreset | null {
  try {
    const parsed = DistributionPresetSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
