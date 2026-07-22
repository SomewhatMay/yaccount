"use client";

import { useState } from "react";
import { DiagnosticsPanel } from "@/features/settings/DiagnosticsPanel";
import { ErrorBoundary } from "@/features/ErrorBoundary";
import { Button } from "@/components/ui/button";

/**
 * Settings. Today it holds the one thing that has to exist before anything else
 * can be debugged; appearance, account and category colour move in here as they
 * are built.
 */
export function SettingsView() {
  return (
    <div className="space-y-8">
      <section className="pt-3 pb-1">
        <p className="text-muted-foreground text-xs font-medium tracking-[0.18em] uppercase">
          Settings
        </p>
        <h1 className="font-display mt-1 text-3xl leading-none">Under the hood</h1>
      </section>

      <ErrorBoundary label="Diagnostics">
        <DiagnosticsPanel />
      </ErrorBoundary>

      {process.env.NODE_ENV === "development" && <SelfTest />}
    </div>
  );
}

/**
 * Development only: proves the safety net is actually wired.
 *
 * Error handling is the one feature that is invisible until the day it matters,
 * which is the worst time to discover a boundary was never mounted. These
 * trigger each distinct path — React render, event handler, floating promise —
 * because they are caught by three different mechanisms.
 */
function SelfTest() {
  const [throwNow, setThrowNow] = useState(false);
  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-display text-lg tracking-tight">Test error handling</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Only shown while developing. Each button fails in a different way — the log
          above should catch all three.
        </p>
      </div>
      <ErrorBoundary label="The self-test">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            className="rounded-full"
            onClick={() => setThrowNow(true)}
          >
            Throw while rendering
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="rounded-full"
            onClick={() => {
              throw new Error("Test: a click handler threw");
            }}
          >
            Throw in a click
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="rounded-full"
            onClick={() => {
              void Promise.reject(new Error("Test: a promise was never handled"));
            }}
          >
            Reject a promise
          </Button>
          <Thrower on={throwNow} />
        </div>
      </ErrorBoundary>
    </section>
  );
}

function Thrower({ on }: { on: boolean }) {
  if (on) throw new Error("Test: a component failed to render");
  return null;
}
