"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SM_UP, useMediaQuery } from "@/features/ui/useMediaQuery";
import { cn } from "@/lib/utils";

/**
 * Editing opens a Sheet, never a mode-swap (§12.4) — but which edge it comes
 * from is a matter of where your hand is. On a phone it rises from the bottom,
 * under the thumb; from `sm` up it slides in from the right, beside the list you
 * were reading. Same component, same content, one rule.
 */
export function ResponsiveSheet({
  open,
  onOpenChange,
  title,
  description,
  className,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  // Prerender assumes the wider layout; the client corrects it on hydration.
  const sideways = useMediaQuery(SM_UP, true);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={sideways ? "right" : "bottom"}
        className={cn(
          "gap-0 overflow-y-auto",
          // A bottom sheet stops short of the top edge so the screen behind it
          // stays visible — you are editing a row, not leaving the ledger.
          "data-[side=bottom]:max-h-[88svh] data-[side=bottom]:rounded-t-2xl",
          "sm:max-w-md",
          className,
        )}
      >
        <SheetHeader>
          <SheetTitle className="font-display text-xl">{title}</SheetTitle>
          {description ? (
            <SheetDescription>{description}</SheetDescription>
          ) : (
            <SheetDescription className="sr-only">{title}</SheetDescription>
          )}
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  );
}
