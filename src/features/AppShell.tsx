"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { AppNav } from "@/features/AppNav";

/**
 * The reading column. Every screen obeys the single-column instinct (§12.4) at
 * `max-w-2xl`, except the dashboard (home) — the one deliberately multi-metric
 * screen §12.4 permits to widen. Route-aware width lives here (client) so the
 * server layout stays static.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const wide = pathname === "/";
  return (
    <div className={cn("mx-auto px-5 pb-24", wide ? "max-w-5xl" : "max-w-2xl")}>
      <AppNav />
      <main className="pt-4">{children}</main>
    </div>
  );
}
