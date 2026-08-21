"use client";

import { MoreHorizontalIcon } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { endTap, moveTap, startTap, type TapState } from "@/features/ui/tap-open";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * The per-row `⋯` menu (§12.4): every action a row offers behind one control, so
 * the resting state of a list is clean.
 *
 * §12.4 says it is "revealed on hover/focus" — but a phone has no hover, and on a
 * touch device that rule resolved to *no row actions at all*: no way to rename a
 * category, log a reported balance or pause a rule. So the hiding is scoped to
 * pointers that can hover (`pointer-coarse:opacity-100`). Same rule, read
 * correctly on a device the rule's wording didn't anticipate.
 *
 * A single component rather than the same six classes copied into six rows —
 * getting this incantation subtly different per screen is exactly how a list
 * ends up unusable on one of them.
 */
export function RowActions({
  label,
  children,
  className,
}: {
  /** What these actions act on — icon-only controls need naming (§12.5). */
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const tap = useRef<TapState | null>(null);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={label}
          onPointerDown={(event) => {
            event.preventDefault();
            tap.current = startTap(event.clientX, event.clientY);
            event.currentTarget?.focus();
          }}
          onPointerMove={(event) => {
            if (tap.current)
              tap.current = moveTap(tap.current, event.clientX, event.clientY);
          }}
          onPointerUp={() => {
            if (tap.current && endTap(tap.current) === "open") setOpen(true);
            tap.current = null;
          }}
          className={cn(
            "text-muted-foreground size-8 shrink-0 touch-pan-y rounded-lg opacity-0 transition-opacity",
            "group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 pointer-coarse:opacity-100",
            className,
          )}
        >
          <MoreHorizontalIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}
