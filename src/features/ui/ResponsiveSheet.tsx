"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SM_UP, useMediaQuery } from "@/features/ui/useMediaQuery";
import { useCallback, useRef, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import {
  bottomSheetViewportStyle,
  retainVisualViewportSnapshot,
  subscribeVisualViewport,
} from "@/features/ui/sheet-viewport";

function visualViewportSnapshot(): string {
  const viewport = window.visualViewport;
  return viewport
    ? `${viewport.height}:${viewport.offsetTop}:${viewport.pageTop}:${window.scrollY}`
    : "";
}

function bottomSheetViewport(snapshot: string) {
  if (!snapshot) return null;
  const [height, offsetTop, pageTop, scrollY] = snapshot.split(":").map(Number);
  return { height, offsetTop, pageTop, scrollY };
}

function useVisualViewport(active: boolean): string {
  const lastSnapshot = useRef("");
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!active) return () => undefined;
      const update = () => {
        lastSnapshot.current = visualViewportSnapshot();
        onChange();
      };
      update();
      const unsubscribeViewport = subscribeVisualViewport(
        window.visualViewport,
        update,
      );
      window.addEventListener("resize", update);
      window.addEventListener("scroll", update);

      // WebKit may update visualViewport late or omit the expected event while
      // animating the keyboard. Poll only while a mobile sheet is open.
      let frame = requestAnimationFrame(function poll() {
        update();
        frame = requestAnimationFrame(poll);
      });

      return () => {
        unsubscribeViewport();
        window.removeEventListener("resize", update);
        window.removeEventListener("scroll", update);
        cancelAnimationFrame(frame);
      };
    },
    [active],
  );
  const getSnapshot = useCallback(
    () =>
      retainVisualViewportSnapshot(
        lastSnapshot.current,
        visualViewportSnapshot(),
        active,
      ),
    [active],
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => "");
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
  const viewport = useVisualViewport(open && !sideways);
  const bottomViewport = bottomSheetViewport(viewport);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={sideways ? "right" : "bottom"}
        style={sideways ? undefined : bottomSheetViewportStyle(bottomViewport)}
        className={cn(
          "max-w-full min-w-0 touch-pan-y gap-0 overflow-x-hidden overflow-y-auto overscroll-contain",
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
