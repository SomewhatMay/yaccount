"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * What a register looks like a moment before it arrives: the shape of the rows,
 * not the word "Loading…". The layout doesn't jump when the data lands, and a
 * slow open reads as a page drawing itself rather than a stall.
 */
export function ListSkeleton({
  rows = 5,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("divide-border divide-y", className)} aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-5 py-3.5">
          <Skeleton className="size-2.5 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1.5">
            {/* Vary the widths so it reads as entries, not a loading bar. */}
            <Skeleton className="h-3" style={{ width: `${52 - (i % 3) * 11}%` }} />
            <Skeleton className="h-2.5" style={{ width: `${34 - (i % 2) * 8}%` }} />
          </div>
          <Skeleton className="h-3 w-14" />
        </div>
      ))}
    </div>
  );
}

/** The same idea for a screen that opens on a figure rather than a list. */
export function FigureSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("pt-3", className)} aria-hidden="true">
      <Skeleton className="h-2.5 w-28" />
      <Skeleton className="mt-3 h-12 w-56 sm:h-14" />
      <Skeleton className="mt-4 h-3 w-64" />
    </div>
  );
}
