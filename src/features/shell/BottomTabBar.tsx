"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAtomValue } from "jotai";
import { cn } from "@/lib/utils";
import { pendingCountAtom } from "@/features/store";
import { TAB_SLOTS, activeTab } from "@/features/shell/nav";

/**
 * The thumb bar (< lg). Four slots, locked: Home · Ledger · Inbox · More.
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
  const pending = useAtomValue(pendingCountAtom);
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
          const badge = slot.badge === "pending" && pending > 0 ? pending : 0;
          const inner = (
            <>
              <span className="relative">
                <slot.icon className="size-5" aria-hidden />
                {badge > 0 && (
                  <span
                    className="bg-primary text-primary-foreground tnum absolute -top-1.5 -right-2.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-mono text-[10px] leading-none"
                    aria-label={`${badge} pending`}
                  >
                    {badge}
                  </span>
                )}
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
                >
                  {inner}
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
