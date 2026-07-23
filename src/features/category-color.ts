/**
 * A category's colour (§12.2, §12.7 signature #2): the tint of its dot, and of
 * its icon when it has one. A category with no stored colour is painted a stable,
 * deterministic hue derived from its id; a stored colour is honoured if present.
 * There is exactly ONE scheme — `categoryColor` / `categoryColorFor` are the only
 * entry points, and both fall back through `categoryDotColor`, so a second can
 * never creep in. (The user-adjustable identity is the icon — see
 * `category-icons.tsx`.)
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
