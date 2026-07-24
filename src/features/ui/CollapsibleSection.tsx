"use client";

import { useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Eyebrow } from "@/features/ui/Eyebrow";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

/**
 * A secondary section of a list — what you archived, what you paused — behind a
 * header that names it and counts it.
 *
 * These sections grow forever and are never what you came for, so on a phone
 * they push the list you *are* reading off the bottom of the screen. Closed by
 * default, they cost one line each instead.
 *
 * The count is the point: §1.1 requires the inverse of every action to stay
 * visible, so "Archived · 3" has to be on the screen even while the rows are
 * folded away. A section with nothing in it renders nothing at all — an empty
 * drawer is not information.
 */
export function CollapsibleSection({
  title,
  count,
  note,
  defaultOpen = false,
  children,
  className,
}: {
  title: string;
  count: number;
  /** A line under the rows explaining what this section means. */
  note?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (count === 0) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={className}>
      <CollapsibleTrigger className="group/section text-muted-foreground hover:text-foreground flex w-full items-center gap-2 rounded-lg px-1 py-1.5 transition-colors duration-[var(--dur-1)]">
        <Eyebrow as="span">{title}</Eyebrow>
        <span className="tnum font-mono text-xs">{count}</span>
        <ChevronDownIcon
          className="ml-auto size-4 transition-transform duration-[var(--dur-1)] ease-[var(--ease-register)] group-data-[state=open]/section:rotate-180"
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent className={cn("mt-2")}>
        {children}
        {note && <p className="text-muted-foreground mt-2 px-1 text-xs">{note}</p>}
      </CollapsibleContent>
    </Collapsible>
  );
}
