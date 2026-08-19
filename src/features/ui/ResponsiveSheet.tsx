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
  subscribeVisualViewport,
  type BottomSheetViewport,
} from "@/features/ui/sheet-viewport";

function visualViewportSnapshot(): BottomSheetViewport | null {
  const viewport = window.visualViewport;
  return viewport
    ? {
        height: viewport.height,
        offsetTop: viewport.offsetTop,
        layoutHeight: window.innerHeight,
      }
    : null;
}

function sameViewport(
  left: BottomSheetViewport | null,
  right: BottomSheetViewport | null,
) {
  return (
    left?.height === right?.height &&
    left?.offsetTop === right?.offsetTop &&
    left?.layoutHeight === right?.layoutHeight
  );
}

function useVisualViewport(active: boolean): BottomSheetViewport | null {
  const [viewport, setViewport] = useState<BottomSheetViewport | null>(null);

  useEffect(() => {
    if (!active) {
      return;
    }

    let frame = 0;
    let attempts = 0;

    const settle = () => {
      cancelAnimationFrame(frame);
      attempts = 0;
      const sample = () => {
        const first = visualViewportSnapshot();
        frame = requestAnimationFrame(() => {
          const second = visualViewportSnapshot();
          if (sameViewport(first, second) || attempts++ >= 6) {
            setViewport(second);
          } else {
            sample();
          }
        });
      };
      sample();
    };

    settle();
    const unsubscribeViewport = subscribeVisualViewport(window.visualViewport, settle);
    window.addEventListener("resize", settle);
    window.addEventListener("orientationchange", settle);

    return () => {
      unsubscribeViewport();
      window.removeEventListener("resize", settle);
      window.removeEventListener("orientationchange", settle);
      cancelAnimationFrame(frame);
    };
  }, [active]);

  return active ? viewport : null;
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
