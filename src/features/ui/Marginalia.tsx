"use client";

import { cn } from "@/lib/utils";

/**
 * The accountant's pencil note: a short aside about the figure it sits under.
 * Fraunces italic between light guillemets — the one place in the app where the
 * serif runs as a line of prose rather than a number.
 *
 * It says something the figure cannot say about itself ("up $312 on last
 * month", "on pace · $412 left"). It is never a label, and it never holds a
 * value you would need to read precisely.
 */
export function Marginalia({
  marks = true,
  className,
  children,
  ...props
}: { marks?: boolean } & React.ComponentProps<"p">) {
  return (
    <p className={cn("marginalia text-muted-foreground", className)} {...props}>
      {marks && (
        <span aria-hidden="true" className="opacity-45">
          &#8249;&nbsp;
        </span>
      )}
      {children}
      {marks && (
        <span aria-hidden="true" className="opacity-45">
          &nbsp;&#8250;
        </span>
      )}
    </p>
  );
}
