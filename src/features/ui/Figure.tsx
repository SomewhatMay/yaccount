"use client";

import { formatCents } from "@/core/money";
import { Eyebrow } from "@/features/ui/Eyebrow";
import { Sparkline } from "@/features/ui/Sparkline";
import { cn } from "@/lib/utils";

/**
 * The balance moment (§12.7 signature #1), and the one place the app raises its
 * voice: a tiny label, a large Fraunces figure, and — when there is history to
 * show — the curve that figure stands on.
 *
 * The curve is not decoration. A balance is the end of a story, and the trailing
 * series is that story: the number has literal ground under it. Give it a
 * `series` only where the reading genuinely has a past.
 */
export function Figure({
  label,
  cents,
  size = "hero",
  negativeIsAlarming = true,
  series,
  className,
  children,
}: {
  label: string;
  cents: number;
  size?: "hero" | "lg" | "md";
  /** Rose when below zero. True for a balance; false for a delta, where a
   *  negative number is ordinary rather than a warning. */
  negativeIsAlarming?: boolean;
  series?: number[];
  className?: string;
  /** Marginalia and supporting stats sit here, under the figure. */
  children?: React.ReactNode;
}) {
  const alarming = negativeIsAlarming && cents < 0;
  return (
    <section className={cn("pt-3", className)}>
      <Eyebrow>{label}</Eyebrow>
      <p
        className={cn(
          "mt-1.5",
          size === "hero" && "figure-hero",
          size === "lg" && "figure-lg",
          size === "md" && "figure-md",
          alarming && "text-destructive",
        )}
      >
        {formatCents(cents)}
      </p>
      {series && series.length > 1 && (
        <Sparkline
          values={series}
          area
          height={40}
          strokeWidth={1.25}
          className={cn(
            "mt-3 max-w-md",
            alarming ? "text-destructive/70" : "text-brand/60",
          )}
        />
      )}
      {children}
    </section>
  );
}
