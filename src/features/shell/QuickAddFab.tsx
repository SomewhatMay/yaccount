"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSetAtom } from "jotai";
import {
  ArrowDownLeftIcon,
  ArrowRightLeftIcon,
  ArrowUpRightIcon,
  DollarSignIcon,
  PlusIcon,
} from "lucide-react";
import { quickAddAtom } from "@/features/store";
import {
  FAB_HOLD_MS,
  cancelFabPress,
  holdFabPress,
  moveFabPress,
  releaseFabPress,
  startFabPress,
  type FabPress,
} from "@/features/shell/fab-hold";

/**
 * The one thing you do more than anything else, always under your thumb.
 *
 * Full-strength iris — this and the active tab are what §12.2 saves the spark
 * for. It floats clear of the tab bar and the home-indicator inset on a phone,
 * and drops into the corner on a desktop, where there is no bar under it.
 *
 * Pressing it starts §12.5's one orchestrated moment: the sheet rises
 * (`--dur-3`), you log, and the row lands in the register with a single iris
 * wash (`--dur-2`). The press itself is the whisper the rest of the app is
 * limited to — a colour and a hair of scale, on `--dur-1`.
 *
 * A release before 500ms opens Expense. Holding for 500ms opens the existing
 * expense/income/transfer paths; moving more than 10px or losing the press
 * cancels. Pointer and keyboard share the same state machine so release can
 * never fire the quick action after the chooser action.
 */
export function QuickAddFab() {
  const openQuickAdd = useSetAtom(quickAddAtom);
  const [chooserOpen, setChooserOpen] = useState(false);
  const press = useRef<FabPress | null>(null);
  const input = useRef<"pointer" | "keyboard" | null>(null);
  const pointerId = useRef<number | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPointerQuickAdd = useRef(false);
  const suppressClick = useRef(false);
  const chooser = useRef<HTMLDivElement | null>(null);
  const fab = useRef<HTMLButtonElement | null>(null);

  const clearHoldTimer = useCallback(() => {
    if (holdTimer.current !== null) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  }, []);

  const suppressNativeClick = useCallback(() => {
    suppressClick.current = true;
  }, []);

  const beginPress = useCallback(
    (source: "pointer" | "keyboard", x = 0, y = 0) => {
      if (input.current !== null || chooserOpen) return;
      input.current = source;
      press.current = startFabPress(x, y);
      holdTimer.current = setTimeout(() => {
        if (!press.current) return;
        const held = holdFabPress(press.current);
        press.current = held;
        if (held.status === "held") setChooserOpen(true);
      }, FAB_HOLD_MS);
    },
    [chooserOpen],
  );

  const finishPress = useCallback(() => {
    if (!press.current) return;
    const source = input.current;
    clearHoldTimer();
    const action = releaseFabPress(press.current);
    press.current = null;
    input.current = null;
    pointerId.current = null;
    if (source === "pointer") {
      if (action === "expense") pendingPointerQuickAdd.current = true;
      else suppressNativeClick();
      return;
    }
    if (action === "expense") openQuickAdd("expense");
  }, [clearHoldTimer, openQuickAdd, suppressNativeClick]);

  const cancelPress = useCallback(() => {
    if (!press.current) return;
    const source = input.current;
    clearHoldTimer();
    press.current = cancelFabPress(press.current);
    input.current = null;
    pointerId.current = null;
    if (source === "pointer") suppressNativeClick();
  }, [clearHoldTimer, suppressNativeClick]);

  useEffect(() => {
    function onKeyUp(event: KeyboardEvent) {
      if (input.current === "keyboard" && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        finishPress();
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (input.current !== null) cancelPress();
      else if (chooserOpen) {
        setChooserOpen(false);
        fab.current?.focus();
      } else return;
      event.preventDefault();
    }

    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("keydown", onKeyDown);
      clearHoldTimer();
    };
  }, [cancelPress, chooserOpen, clearHoldTimer, finishPress]);

  useEffect(() => {
    if (chooserOpen) chooser.current?.querySelector("button")?.focus();
  }, [chooserOpen]);

  return (
    <>
      <button
        ref={fab}
        type="button"
        onPointerDown={(event) => {
          if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0))
            return;
          event.preventDefault();
          event.currentTarget.focus();
          pendingPointerQuickAdd.current = false;
          suppressClick.current = false;
          pointerId.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          beginPress("pointer", event.clientX, event.clientY);
        }}
        onPointerMove={(event) => {
          if (
            input.current !== "pointer" ||
            pointerId.current !== event.pointerId ||
            !press.current
          )
            return;
          press.current = moveFabPress(press.current, event.clientX, event.clientY);
          if (press.current.status === "cancelled") clearHoldTimer();
        }}
        onPointerUp={(event) => {
          if (input.current === "pointer" && pointerId.current === event.pointerId)
            finishPress();
        }}
        onPointerCancel={(event) => {
          if (input.current === "pointer" && pointerId.current === event.pointerId)
            cancelPress();
        }}
        onLostPointerCapture={(event) => {
          if (input.current === "pointer" && pointerId.current === event.pointerId)
            cancelPress();
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          if (!event.repeat) beginPress("keyboard");
        }}
        onClick={() => {
          if (pendingPointerQuickAdd.current) {
            pendingPointerQuickAdd.current = false;
            openQuickAdd("expense");
            return;
          }
          if (suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          openQuickAdd("expense");
        }}
        aria-label="Log a transaction"
        aria-haspopup="menu"
        aria-expanded={chooserOpen}
        aria-controls={chooserOpen ? "fab-create-chooser" : undefined}
        className="bg-primary text-primary-foreground focus-visible:ring-ring/60 focus-visible:ring-offset-background fixed right-5 bottom-[calc(var(--mobile-tab-bar-height)_+_0.5rem_+_env(safe-area-inset-bottom,0px))] z-40 inline-flex size-14 touch-none items-center justify-center rounded-full shadow-lg transition-transform duration-[var(--dur-1)] ease-[var(--ease-register)] select-none [-webkit-user-select:none] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none active:scale-95 lg:right-8 lg:bottom-8"
      >
        <span data-money-add-mark className="relative block size-7" aria-hidden="true">
          <DollarSignIcon
            data-money-add-dollar
            className="absolute top-1 left-0 size-5"
          />
          <PlusIcon data-money-add-plus className="absolute top-0 right-0 size-3.5" />
        </span>
      </button>
      {chooserOpen && (
        <div
          ref={chooser}
          id="fab-create-chooser"
          role="menu"
          aria-label="Choose what to add"
          onKeyDown={(event) => {
            const items = [
              ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                '[role="menuitem"]',
              ),
            ];
            const current = items.indexOf(document.activeElement as HTMLButtonElement);
            let next: number | null = null;
            if (event.key === "ArrowDown") next = (current + 1) % items.length;
            if (event.key === "ArrowUp")
              next = (current - 1 + items.length) % items.length;
            if (event.key === "Home") next = 0;
            if (event.key === "End") next = items.length - 1;
            if (next === null) return;
            event.preventDefault();
            items[next]?.focus();
          }}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setChooserOpen(false);
          }}
          className="bg-popover text-popover-foreground ring-foreground/10 fixed right-5 bottom-[calc(8.5rem_+_env(safe-area-inset-bottom,0px))] z-50 w-48 touch-manipulation rounded-xl p-1.5 shadow-lg ring-1 select-none [-webkit-user-select:none] lg:right-8 lg:bottom-24"
        >
          <p className="text-muted-foreground px-1.5 py-1 text-xs font-medium">
            Add an entry
          </p>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setChooserOpen(false);
              openQuickAdd("expense");
            }}
            className="focus:bg-accent focus:text-accent-foreground flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm outline-none"
          >
            <ArrowUpRightIcon />
            Expense
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setChooserOpen(false);
              openQuickAdd("income");
            }}
            className="focus:bg-accent focus:text-accent-foreground flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm outline-none"
          >
            <ArrowDownLeftIcon className="text-positive" />
            Income
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setChooserOpen(false);
              openQuickAdd("transfer");
            }}
            className="focus:bg-accent focus:text-accent-foreground flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm outline-none"
          >
            <ArrowRightLeftIcon />
            Transfer
          </button>
        </div>
      )}
    </>
  );
}
