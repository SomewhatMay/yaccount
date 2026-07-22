"use client";

import { sparklinePath } from "@/features/ui/geometry";
import { cn } from "@/lib/utils";

/**
 * A series drawn small enough to read as a shape rather than a chart — no axes,
 * no labels, no tooltip. It carries direction, not values; the figure beside it
 * carries the value.
 *
 * Stretches to its container (`preserveAspectRatio="none"`) with a
 * non-scaling stroke, so the same curve works at 60px and at full width without
 * the line thickening.
 */
export function Sparkline({
  values,
  height = 24,
  area = false,
  strokeWidth = 1.5,
  className,
  ...props
}: {
  values: number[];
  height?: number;
  /** Fill down to the baseline — for a curve something is standing ON. */
  area?: boolean;
  strokeWidth?: number;
  // `values`, `height` and `width` are also SVG presentation attributes; ours win.
} & Omit<
  React.ComponentProps<"svg">,
  "viewBox" | "children" | "values" | "height" | "width" | "strokeWidth"
>) {
  const geometry = sparklinePath(values, { width: 100, height, padding: strokeWidth });
  if (!geometry) return null;

  return (
    <svg
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      className={cn("block w-full overflow-visible", className)}
      style={{ height }}
      {...props}
    >
      {area && <path d={geometry.area} fill="currentColor" fillOpacity={0.14} />}
      <path
        d={geometry.line}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
