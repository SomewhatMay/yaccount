"use client";

import { useEffect } from "react";
import { ErrorCard } from "@/features/ErrorBoundary";
import { createLogger } from "@/lib/logger";

const log = createLogger("ui");

/**
 * The route-level boundary: catches anything a screen throws during render that
 * a section boundary didn't already stop. The app shell, nav and data stay
 * mounted, so the user can simply move to another screen.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    log.capture("screen failed to render", error);
  }, [error]);

  return (
    <div className="py-8">
      <ErrorCard error={error} resetErrorBoundary={reset} label="This screen" />
    </div>
  );
}
