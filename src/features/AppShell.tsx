"use client";

import { usePathname } from "next/navigation";
import { useAtomValue } from "jotai";
import { AlertTriangleIcon, RotateCcwIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { AppNav } from "@/features/AppNav";
import { ErrorBoundary, CopyButton } from "@/features/ErrorBoundary";
import { bootErrorAtom } from "@/features/store";
import { Button } from "@/components/ui/button";

/**
 * The reading column. Every screen obeys the single-column instinct (§12.4) at
 * `max-w-2xl`, except the dashboard (home) — the one deliberately multi-metric
 * screen §12.4 permits to widen. Route-aware width lives here (client) so the
 * server layout stays static.
 *
 * It is also where the two whole-app failure states live: the local database
 * failing to open (nothing can work), and a screen throwing during render (only
 * that screen is lost — the nav stays, so you can move somewhere else).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const bootError = useAtomValue(bootErrorAtom);
  const wide = pathname === "/";

  return (
    <div className={cn("mx-auto px-5 pb-24", wide ? "max-w-5xl" : "max-w-2xl")}>
      <AppNav />
      <main className="pt-4">
        {bootError ? (
          <BootFailure detail={bootError} />
        ) : (
          // Keyed on the route so moving to another screen clears a failure
          // rather than stranding you on it.
          <ErrorBoundary label="This screen" resetKeys={[pathname]}>
            {children}
          </ErrorBoundary>
        )}
      </main>
    </div>
  );
}

/**
 * IndexedDB did not open. This is the one failure with no partial mode: there is
 * no ledger to read, so the screen has to explain the likely cause rather than
 * leave every view spinning on "Loading…" the way it used to.
 */
function BootFailure({ detail }: { detail: string }) {
  return (
    <div
      role="alert"
      className="border-destructive/25 bg-destructive/[0.04] mt-6 rounded-2xl border p-6"
    >
      <div className="flex items-start gap-3">
        <AlertTriangleIcon
          className="text-destructive mt-1 size-5 shrink-0"
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl">
            yaccount couldn&apos;t open your ledger.
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Your data is stored in this browser, and reaching it failed. This usually
            means private browsing, a browser setting that blocks site storage, or another
            tab running a different version of the app.
          </p>
          <p className="text-muted-foreground/80 mt-3 font-mono text-xs break-words">
            {detail}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              className="rounded-full"
              onClick={() => window.location.reload()}
            >
              <RotateCcwIcon className="size-3.5" />
              Try again
            </Button>
            <CopyButton text={detail} />
          </div>
        </div>
      </div>
    </div>
  );
}
