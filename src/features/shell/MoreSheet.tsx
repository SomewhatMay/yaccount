"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ResponsiveSheet } from "@/features/ui";
import { AuthButton } from "@/features/auth/AuthButton";
import { ThemeToggle } from "@/features/shell/ThemeToggle";
import { MORE_DESTINATIONS } from "@/features/shell/nav";

/**
 * What the compact tabs and topbar displace.
 *
 * A sheet rather than a route, so "More" is never somewhere you have to come
 * back from — you tap a screen and the sheet is gone. The routes themselves are
 * unchanged at this width; only the way you reach them is.
 */
export function MoreSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const pathname = usePathname();

  return (
    <ResponsiveSheet open={open} onOpenChange={onOpenChange} title="More">
      <nav aria-label="More screens" className="px-2 pb-2">
        <ul>
          {MORE_DESTINATIONS.map((d) => {
            const current = pathname === d.href;
            return (
              <li key={d.href}>
                <Link
                  href={d.href}
                  onClick={() => onOpenChange(false)}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "hover:bg-accent/60 flex items-center gap-3 rounded-xl px-3 py-3 transition-colors duration-[var(--dur-1)]",
                    current && "text-primary",
                  )}
                >
                  <d.icon
                    className={cn("size-5 shrink-0", !current && "text-muted-foreground")}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{d.label}</span>
                    <span className="text-muted-foreground block text-xs">{d.hint}</span>
                  </span>
                  <ChevronRightIcon
                    className="text-muted-foreground/60 size-4 shrink-0"
                    aria-hidden
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mt-2 flex items-center gap-2 border-t px-5 py-4">
        <AuthButton />
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>
    </ResponsiveSheet>
  );
}
