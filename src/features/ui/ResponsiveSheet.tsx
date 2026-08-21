"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SM_UP, useMediaQuery } from "@/features/ui/useMediaQuery";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  bottomSheetViewportStyle,
  nextBaseline,
  type BottomSheetViewport,
} from "@/features/ui/sheet-viewport";

function useVisualViewport(active: boolean): BottomSheetViewport | null {
  const [state, setState] = useState<{
    active: boolean;
    viewport: BottomSheetViewport | null;
  }>({ active, viewport: null });
  const baseline = useRef(0);

  if (state.active !== active) {
    setState({ active, viewport: null });
  }

  useEffect(() => {
    if (!active) {
      baseline.current = 0;
      return;
    }

    const visual = window.visualViewport;
    if (!visual) return;

    baseline.current = visual.height;
    const update = () => {
      baseline.current = nextBaseline(baseline.current, visual.height);
      setState({
        active: true,
        viewport: {
          height: visual.height,
          layoutHeight: baseline.current,
        },
      });
    };

    visual.addEventListener("resize", update);

    return () => {
      visual.removeEventListener("resize", update);
    };
  }, [active]);

  return active && state.active ? state.viewport : null;
}

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
  bodyClassName,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  // Prerender assumes the wider layout; the client corrects it on hydration.
  const sideways = useMediaQuery(SM_UP, true);
  const viewport = useVisualViewport(open && !sideways);
  const titleRef = useRef<HTMLHeadingElement>(null);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={sideways ? "right" : "bottom"}
        style={sideways ? undefined : bottomSheetViewportStyle(viewport)}
        onOpenAutoFocus={(event) => {
          if (!sideways) {
            event.preventDefault();
            titleRef.current?.focus({ preventScroll: true });
          }
        }}
        className={cn(
          "max-w-full min-w-0 touch-pan-y gap-0 overflow-hidden",
          // A bottom sheet stops short of the top edge so the screen behind it
          // stays visible — you are editing a row, not leaving the ledger.
          "data-[side=bottom]:max-h-[88svh] data-[side=bottom]:rounded-t-2xl",
          "sm:max-w-md",
          className,
        )}
      >
        <SheetHeader>
          <SheetTitle ref={titleRef} tabIndex={-1} className="font-display text-xl">
            {title}
          </SheetTitle>
          {description ? (
            <SheetDescription>{description}</SheetDescription>
          ) : (
            <SheetDescription className="sr-only">{title}</SheetDescription>
          )}
        </SheetHeader>
        <div
          data-slot="sheet-body"
          className={cn(
            "min-h-0 flex-1 [scroll-padding-bottom:calc(1rem+env(safe-area-inset-bottom,0px))] overflow-x-hidden overflow-y-auto overscroll-contain",
            bodyClassName,
          )}
        >
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}
