import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function InlineError({
  id,
  children,
  className,
}: {
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      id={id}
      role="alert"
      aria-live="polite"
      className={cn("text-destructive text-sm", className)}
    >
      {children}
    </p>
  );
}
