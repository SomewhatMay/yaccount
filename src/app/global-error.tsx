"use client";

import { useEffect } from "react";
import { BUILD_INFO, buildInfoFacts } from "@/lib/build-info";
import {
  collectDiagnostics,
  createDiagnosticsFile,
  triggerDiagnosticsDownload,
} from "@/lib/diagnostics-export";
import { createLogger } from "@/lib/logger";

const log = createLogger("app");

/**
 * The last boundary: something failed in the root layout itself, so there is no
 * shell, no theme and no fonts left to rely on. Everything here is deliberately
 * self-contained — plain elements and inline styles — because the thing that
 * broke may be the very stylesheet or provider this page would otherwise use.
 *
 * The one job is to not show a blank white screen, and to say the two things
 * that matter: the data is still on the device, and here is what to send us.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const detail = [
    error.name,
    error.message,
    error.digest && `digest ${error.digest}`,
    error.stack,
  ]
    .filter(Boolean)
    .join("\n");
  const facts = () => ({
    ...buildInfoFacts(BUILD_INFO),
    "current error": detail,
  });

  useEffect(() => {
    log.capture("root failed to render", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "2rem",
          background: "#0f0e13",
          color: "#eceaf2",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <main style={{ maxWidth: "34rem", width: "100%" }}>
          <p
            style={{
              margin: 0,
              fontSize: "0.72rem",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#9a95ad",
            }}
          >
            yaccount
          </p>
          <h1 style={{ margin: "0.75rem 0 0", fontSize: "1.6rem", fontWeight: 600 }}>
            The app couldn&apos;t start.
          </h1>
          <p style={{ margin: "0.75rem 0 0", lineHeight: 1.55, color: "#c3bed3" }}>
            Your ledger is stored on this device and has not been touched. Reloading
            usually clears this.
          </p>
          <p style={{ margin: "0.65rem 0 0", fontSize: "0.75rem", color: "#9a95ad" }}>
            Build {BUILD_INFO.version} ·{" "}
            {BUILD_INFO.commitUrl ? (
              <a href={BUILD_INFO.commitUrl} style={{ color: "inherit" }}>
                {BUILD_INFO.shortSha}
              </a>
            ) : (
              BUILD_INFO.shortSha
            )}
          </p>
          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              marginTop: "1.5rem",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={reset}
              style={{
                cursor: "pointer",
                border: 0,
                borderRadius: "999px",
                padding: "0.55rem 1.1rem",
                fontSize: "0.875rem",
                fontWeight: 500,
                background: "#6d5ef0",
                color: "#fff",
              }}
            >
              Reload the app
            </button>
            <button
              onClick={() =>
                void collectDiagnostics(facts()).then((text) =>
                  navigator.clipboard?.writeText(text),
                )
              }
              style={{
                cursor: "pointer",
                borderRadius: "999px",
                border: "1px solid #37334a",
                padding: "0.55rem 1.1rem",
                fontSize: "0.875rem",
                background: "transparent",
                color: "#c3bed3",
              }}
            >
              Copy diagnostics
            </button>
            <button
              onClick={() =>
                void collectDiagnostics(facts()).then((text) =>
                  triggerDiagnosticsDownload(createDiagnosticsFile(text)),
                )
              }
              style={{
                cursor: "pointer",
                borderRadius: "999px",
                border: "1px solid #37334a",
                padding: "0.55rem 1.1rem",
                fontSize: "0.875rem",
                background: "transparent",
                color: "#c3bed3",
              }}
            >
              Download diagnostics
            </button>
          </div>
          <details
            style={{
              marginTop: "1.5rem",
              padding: "0.9rem",
              borderRadius: "0.75rem",
              background: "#17161f",
              color: "#9a95ad",
              fontSize: "0.72rem",
              lineHeight: 1.5,
            }}
          >
            <summary style={{ cursor: "pointer" }}>Details</summary>
            <pre
              style={{
                margin: "0.75rem 0 0",
                maxHeight: "12rem",
                overflow: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {detail}
            </pre>
          </details>
        </main>
      </body>
    </html>
  );
}
