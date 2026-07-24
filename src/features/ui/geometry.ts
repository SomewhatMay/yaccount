/**
 * Series → SVG path. Pure, so the shape of a curve is unit-testable rather than
 * something you can only judge by squinting at a screen.
 *
 * Both signature curves in the register — the 90-day balance the hero figure
 * stands on, and the per-row sparklines — are the same normalization: fit the
 * readings into a fixed box, largest at the top.
 */

export interface SparkGeometry {
  /** The curve itself. */
  line: string;
  /** The same curve closed down to the baseline, for a fill. */
  area: string;
}

export interface SparkOptions {
  width?: number;
  height?: number;
  /** Inset so a stroke isn't clipped at the top and bottom of the viewBox. */
  padding?: number;
}

/** Trim trailing zeros so paths stay short: 3.50 → 3.5, 10.00 → 10. */
function round(n: number): string {
  return String(Math.round(n * 100) / 100);
}

export function sparklinePath(
  values: number[],
  { width = 100, height = 24, padding = 0 }: SparkOptions = {},
): SparkGeometry | null {
  if (values.length === 0) return null;

  const top = padding;
  const bottom = height - padding;
  const span = bottom - top;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;

  // A single reading, or a balance that never moved, has no shape — draw it
  // through the middle rather than dividing by a zero range.
  const y = (v: number) =>
    range === 0 ? top + span / 2 : bottom - ((v - min) / range) * span;
  const x = (i: number) => (values.length === 1 ? 0 : (i / (values.length - 1)) * width);

  const points = values.map((v, i) => `${round(x(i))},${round(y(v))}`);
  const line =
    values.length === 1
      ? `M${points[0]} L${round(width)},${points[0].split(",")[1]}`
      : `M${points[0]} ${points
          .slice(1)
          .map((p) => `L${p}`)
          .join(" ")}`;

  return {
    line,
    area: `${line} L${round(width)},${round(height)} L0,${round(height)} Z`,
  };
}
