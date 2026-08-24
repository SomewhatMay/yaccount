"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { TAB_SLOTS, activeTab, tabSlotState } from "@/features/shell/nav";

const TAB_TOUCH_MOVE_PX = 10;

type TabTouchPress = {
  href: string;
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
};

function TabLinkContent({
  current,
  children,
}: {
  current: boolean;
  children: ReactNode;
}) {
  const { pending } = useLinkStatus();
  const state = tabSlotState({ current, pending });

  return (
    <>
      {children}
      {state === "pending" && (
        <span
          data-tab-pending
          aria-hidden
          className="bg-primary/60 absolute inset-x-1/3 top-0 h-0.5 animate-pulse rounded-full"
        />
      )}
    </>
  );
}

/**
 * The thumb bar (< lg). Four slots, locked: Home · Ledger · Goals · More.
 *
 * The active slot uses full-strength iris plus a short top marker. The marker
 * keeps the current location visible without relying on color alone.
 *
 * It sits above the home-indicator inset (`env(safe-area-inset-bottom)`), and
 * the page reserves matching space so the last row of a register is never stuck
 * underneath it.
 */
export function BottomTabBar({ onMore }: { onMore: () => void }) {
  const pathname = usePathname();
  const touchPress = useRef<TabTouchPress | null>(null);
  const active = activeTab(pathname);

  return (
    <nav
      aria-label="Primary"
      className="bg-background/95 fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur lg:hidden"
    >
      <ul
        className="mx-auto flex max-w-2xl items-stretch"
        style={{
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        {TAB_SLOTS.map((slot) => {
          const current = active === (slot.href ?? "more");
          const inner = (
            <>
              <span>
                <slot.icon className="size-5" aria-hidden />
              </span>
              <span className="text-[0.6875rem] leading-none font-medium">
                {slot.label}
              </span>
            </>
          );
          const className = cn(
            "relative flex h-[var(--mobile-tab-bar-height)] w-full flex-col items-center justify-center gap-1.5 transition-colors duration-[var(--dur-1)]",
            "focus-visible:ring-ring focus-visible:ring-inset focus-visible:ring-2 focus-visible:outline-none",
            current
              ? "text-primary after:bg-primary after:absolute after:inset-x-1/3 after:top-0 after:h-0.5 after:rounded-full"
              : "text-muted-foreground",
          );

          return (
            <li key={slot.label} className="flex-1">
              {slot.href ? (
                <Link
                  href={slot.href}
                  aria-current={current ? "page" : undefined}
                  className={className}
                  onPointerDown={(event) => {
                    if (event.pointerType !== "touch" || !event.isPrimary) return;
                    event.preventDefault();
                    touchPress.current = {
                      href: slot.href!,
                      pointerId: event.pointerId,
                      startX: event.clientX,
                      startY: event.clientY,
                      moved: false,
                    };
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }}
                  onPointerMove={(event) => {
                    const press = touchPress.current;
                    if (!press || press.pointerId !== event.pointerId) return;
                    if (
                      Math.hypot(
                        event.clientX - press.startX,
                        event.clientY - press.startY,
                      ) > TAB_TOUCH_MOVE_PX
                    ) {
                      press.moved = true;
                    }
                  }}
                  onPointerUp={(event) => {
                    const press = touchPress.current;
                    touchPress.current = null;
                    if (
                      !press ||
                      press.pointerId !== event.pointerId ||
                      press.href !== slot.href ||
                      press.moved
                    )
                      return;
                    event.preventDefault();
                    event.currentTarget.click();
                  }}
                  onPointerCancel={() => {
                    touchPress.current = null;
                  }}
                  onLostPointerCapture={() => {
                    touchPress.current = null;
                  }}
                >
                  <TabLinkContent current={current}>{inner}</TabLinkContent>
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={onMore}
                  aria-label="More screens"
                  aria-pressed={current}
                  className={className}
                >
                  {inner}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
