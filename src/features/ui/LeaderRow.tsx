"use client";

import { cn } from "@/lib/utils";

/**
 * A name, a rail of dots, an amount — the way a printed statement gets your eye
 * from one to the other across a gap. Only for sparse summary lists (the plan,
 * a totals block); the dense register would become a page of ruled lines.
 */
export function LeaderRow({
  label,
  dot,
  className,
  children,
}: {
  label: React.ReactNode;
  /** A category swatch, when the row belongs to one (§12.2). */
  dot?: string;
  className?: string;
  /** The amount. */
  children: React.ReactNode;
}) {
  return (
    <div className={cn("leaders py-1.5 text-sm", className)}>
      <span className="inline-flex min-w-0 items-baseline gap-2">
        {dot && (
          <span
            className="size-2 shrink-0 translate-y-px rounded-full"
            style={{ backgroundColor: dot }}
            aria-hidden="true"
          />
        )}
        <span className="truncate">{label}</span>
      </span>
      <span>{children}</span>
    </div>
  );
}
