/**
 * Category identity is colour (§12.2, §12.7 signature #2). The scheme is a
 * hybrid (spec §10.1): a category with no stored colour is painted a stable,
 * deterministic hue derived from its id; a category the user has coloured wears
 * that override. There is exactly ONE swatch scheme — `categoryColor` /
 * `categoryColorFor` are the only entry points, and both fall back through
 * `categoryDotColor`, so a second scheme can never creep in.
 */

/** The auto half: derive a stable hue from a category id so an un-coloured
 * category still carries a consistent dot across the UI. Computed at render,
 * never stored — it doesn't touch the data model. */
export function categoryDotColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  // Golden-angle spread keeps adjacent ids visually distinct.
  const hue = (h * 137.508) % 360;
  return `oklch(0.68 0.15 ${hue.toFixed(1)})`;
}

/** Resolve a category's colour: the stored override if it set one, otherwise
 * the deterministic hue. An empty string is not a colour, so it reads as "no
 * override" rather than painting the dot transparent. */
export function categoryColor(category: { id: string; color: string | null }): string {
  return category.color ? category.color : categoryDotColor(category.id);
}

/** Same resolution from an id plus the category list — for the call sites that
 * hold a `category_id` (a transaction, a chart series) rather than the row. An
 * unknown id falls back to its deterministic hue, so a dangling reference is
 * still coloured, never blank. */
export function categoryColorFor(
  id: string,
  categories: readonly { id: string; color: string | null }[],
): string {
  const cat = categories.find((c) => c.id === id);
  return cat ? categoryColor(cat) : categoryDotColor(id);
}

/**
 * The override palette (§10.1): a fixed, legible set the user picks from when
 * setting a category's colour. Same oklch discipline as the auto dots
 * (`L ≈ 0.65`, `C ≈ 0.15`) so an overridden dot sits beside an auto one without
 * looking like a different system, and mid-toned so it stays visible on `--card`
 * in both themes. Spread around the wheel for distinctness; iris (≈285) is left
 * out so a category can't impersonate the brand spark.
 */
export const CATEGORY_PALETTE: readonly string[] = [
  "oklch(0.64 0.17 25)", // red
  "oklch(0.68 0.16 55)", // orange
  "oklch(0.74 0.15 90)", // amber
  "oklch(0.72 0.16 130)", // lime
  "oklch(0.66 0.15 160)", // green
  "oklch(0.68 0.11 195)", // teal
  "oklch(0.65 0.13 230)", // sky
  "oklch(0.58 0.16 260)", // blue
  "oklch(0.62 0.17 330)", // magenta
  "oklch(0.66 0.17 5)", // pink
  "oklch(0.70 0.03 285)", // slate — a quiet, near-neutral option
];
