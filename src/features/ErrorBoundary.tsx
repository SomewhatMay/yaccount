"use client";

import { useState } from "react";
import {
  ErrorBoundary as ReactErrorBoundary,
  type FallbackProps,
} from "react-error-boundary";
import { AlertTriangleIcon, CheckIcon, CopyIcon, RotateCcwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { describeError, errorDetail } from "@/lib/errors";
import { createLogger } from "@/lib/logger";

const log = createLogger("ui");

/**
 * A render failure that stops at this element instead of blanking the app.
 *
 * Used per SECTION, not once at the root: a chart that trips over an unexpected
 * shape should cost you that chart, not the dashboard — and definitely not the
 * ledger. The fallback names what broke, because "Something went wrong" is the
 * message that makes a bug unreportable.
 *
 * `resetKeys` re-mounts the subtree when they change, so navigating away and
 * back, or changing the reporting period, clears a transient failure by itself.
 */
export function ErrorBoundary({
  label,
  children,
  resetKeys,
}: {
  /** What the user will recognize as broken — "the dashboard", "this chart". */
  label: string;
  children: React.ReactNode;
  resetKeys?: unknown[];
}) {
  return (
    <ReactErrorBoundary
      resetKeys={resetKeys}
      onError={(error, info) => log.capture(`${label} failed to render`, error ?? info)}
      fallbackRender={(props) => <ErrorCard {...props} label={label} />}
    >
      {children}
    </ReactErrorBoundary>
  );
}

export function ErrorCard({
  error,
  resetErrorBoundary,
  label,
}: FallbackProps & { label: string }) {
  return (
    <div
      role="alert"
      className="border-destructive/25 bg-destructive/[0.04] rounded-2xl border p-5"
    >
      <div className="flex items-start gap-3">
        <AlertTriangleIcon
          className="text-destructive mt-0.5 size-4 shrink-0"
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{label} didn&apos;t load.</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Nothing was lost — your data is stored on this device. Try again, or copy the
            details if it keeps happening.
          </p>
          <p className="text-muted-foreground/80 mt-2 font-mono text-xs break-words">
            {describeError(error)}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="rounded-full"
              onClick={resetErrorBoundary}
            >
              <RotateCcwIcon className="size-3.5" />
              Try again
            </Button>
            <CopyButton text={errorDetail(error)} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Copy-to-clipboard that says whether it worked, since a silent copy button
 * leaves you unsure whether to paste. */
export function CopyButton({
  text,
  label = "Copy details",
  className,
}: {
  text: string | (() => string);
  label?: string;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <Button
      size="sm"
      variant="ghost"
      className={className ?? "rounded-full"}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(typeof text === "function" ? text() : text);
          setState("copied");
        } catch (err) {
          // Clipboard needs a secure context and permission; say so rather than
          // appearing to succeed.
          log.capture("clipboard write failed", err);
          setState("failed");
        }
        setTimeout(() => setState("idle"), 2000);
      }}
    >
      {state === "copied" ? (
        <CheckIcon className="size-3.5" />
      ) : (
        <CopyIcon className="size-3.5" />
      )}
      {state === "copied" ? "Copied" : state === "failed" ? "Couldn't copy" : label}
    </Button>
  );
}
