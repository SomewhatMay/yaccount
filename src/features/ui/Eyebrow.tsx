"use client";

import { cn } from "@/lib/utils";

/**
 * The small uppercase label that names a figure without competing with it
 * (§12.4). One tracking, one size, everywhere — an eyebrow that varies per
 * screen is just noise wearing a label's clothes.
 */
export function Eyebrow({
  as: Tag = "p",
  className,
  ...props
}: { as?: "p" | "h2" | "h3" | "span" } & React.ComponentProps<"p">) {
  return <Tag className={cn("eyebrow text-muted-foreground", className)} {...props} />;
}
