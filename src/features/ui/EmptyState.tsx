"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * An empty screen is an invitation, not a mood (§12.6). Say what belongs here
 * and give the reader the one action that puts it there — never an apology, and
 * never a shrug.
 */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  /** One line on what goes here and why. */
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("px-6 py-14 text-center", className)}>
      {Icon && (
        <Icon
          className="text-muted-foreground/40 mx-auto mb-3 size-6"
          strokeWidth={1.5}
          aria-hidden="true"
        />
      )}
      <p className="figure-md text-foreground">{title}</p>
      {children && (
        <p className="text-muted-foreground mx-auto mt-2 max-w-xs text-sm text-balance">
          {children}
        </p>
      )}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
