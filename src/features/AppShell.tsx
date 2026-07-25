"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useAtomValue } from "jotai";
import { AlertTriangleIcon, RotateCcwIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ErrorBoundary, CopyButton } from "@/features/ErrorBoundary";
import { bootErrorAtom } from "@/features/store";
import { Button } from "@/components/ui/button";
import { BottomTabBar } from "@/features/shell/BottomTabBar";
import { CommandPalette } from "@/features/shell/CommandPalette";
import { MoreSheet } from "@/features/shell/MoreSheet";
import { QuickAddFab } from "@/features/shell/QuickAddFab";
import { QuickAddSheet } from "@/features/shell/QuickAddSheet";
import { SidebarRail } from "@/features/shell/SidebarRail";
import { SyncErrorBanner } from "@/features/SyncErrorBanner";
import { TopBar } from "@/features/shell/TopBar";

/**
 * The chrome around every screen, and the two whole-app failure states.
 *
 * Navigation changes shape with the width, the routes never do (locked,
 * 2026-07-22): `/` is the dashboard and `/ledger` the register on a phone and on
 * a desktop alike. Below `lg` you get a compact top bar, four thumb tabs and the
 * quick-add FAB; from `lg` a rail carrying every destination takes over and the
 * tab bar disappears. The reading column itself is unchanged either way —
 * `max-w-2xl`, or `max-w-5xl` for the dashboard, the one screen §12.4 lets widen.
 *
 * The failures: the local database failing to open (nothing can work), and a
 * screen throwing during render (only that screen is lost — the chrome stays, so
 * you can move somewhere else).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const bootError = useAtomValue(bootErrorAtom);
  const [moreOpen, setMoreOpen] = useState(false);
  const maxWidth = pathname === "/" ? "max-w-5xl" : "max-w-2xl";

  return (
    <div className="lg:pl-56">
      <SidebarRail />
      <TopBar maxWidth={maxWidth} />

      {/* Bottom padding clears the tab bar, the FAB and the home indicator. */}
      <main
        className={cn("mx-auto px-5 pt-5", maxWidth)}
        style={{
          paddingBottom: "calc(7rem + calc(0.5rem + env(safe-area-inset-bottom, 0px)))",
        }}
      >
        {bootError ? (
          <BootFailure detail={bootError} />
        ) : (
          <>
            {/* A persistent sync failure, surfaced on every screen (§12.6). */}
            <SyncErrorBanner />
            {/* Keyed on the route so moving to another screen clears a failure
                rather than stranding you on it. */}
            <ErrorBoundary label="This screen" resetKeys={[pathname]}>
              {children}
            </ErrorBoundary>
          </>
        )}
      </main>

      {/* Writing is reachable from every screen, and never blocked by a boot
          failure being on screen — but there is nothing to write to if the
          database never opened, so the FAB goes with it. */}
      {!bootError && (
        <>
          <QuickAddFab />
          <QuickAddSheet />
        </>
      )}
      <BottomTabBar onMore={() => setMoreOpen(true)} />
      <MoreSheet open={moreOpen} onOpenChange={setMoreOpen} />
      <CommandPalette />
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
