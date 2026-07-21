/**
 * Presentational only: derive a stable hue from a category id so each category
 * carries a consistent color dot across the UI. This foreshadows the §10.1
 * deterministic auto-palette that officially ships in M5 — it is computed at
 * render, never stored, so it doesn't touch the data model.
 */
export function categoryDotColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  // Golden-angle spread keeps adjacent ids visually distinct.
  const hue = (h * 137.508) % 360;
  return `oklch(0.68 0.15 ${hue.toFixed(1)})`;
}
