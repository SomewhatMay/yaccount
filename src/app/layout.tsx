import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { RepoBootstrap } from "@/features/RepoBootstrap";
import { AppShell } from "@/features/AppShell";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });
// Fraunces: soft, characterful serif — display moments only (§12.3). M11 loads
// its variable axes so the figure scale can be cut for size rather than just
// scaled (opsz), softened (SOFT) and allowed its quirk at hero size (WONK) —
// plus the italic, which is what the marginalia device is set in.
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  style: ["normal", "italic"],
  axes: ["SOFT", "WONK", "opsz"],
});

export const metadata: Metadata = {
  title: "yaccount",
  description: "Local-first personal finance",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const longTaskObserverScript = String.raw`
  (() => {
    const session = Math.random().toString(36).slice(2);
    const records = [];
    let ledgerPointerDown = null;
    let ledgerClick = null;
    let ledgerVisible = null;
    let routeWatchStarted = false;
    const supportedEntryTypes =
      typeof PerformanceObserver === "undefined"
        ? []
        : PerformanceObserver.supportedEntryTypes ?? [];

    function record(event, detail) {
      const entry = { event, ...detail };
      records.push(entry);
      console.info("[tap-perf] " + event, JSON.stringify(detail));
    }

    record("observer-start", {
      session,
      startedAt: performance.now(),
      supportedEntryTypes,
    });

    function rounded(value) {
      return value === null ? null : Number(value.toFixed(1));
    }

    function eventOccurredAt(event) {
      const stamp = Number(event.timeStamp);
      if (!Number.isFinite(stamp)) return null;
      return stamp > performance.now() + 60_000 ? stamp - performance.timeOrigin : stamp;
    }

    function isLedgerPath(pathname) {
      return pathname.replace(/\/+$/, "").endsWith("/ledger");
    }

    function isLedgerTabEvent(event) {
      if (!(event.target instanceof Element)) return false;
      const link = event.target.closest('nav[aria-label="Primary"] a');
      if (!link) return false;
      return isLedgerPath(
        new URL(link.getAttribute("href") ?? "", location.href).pathname,
      );
    }

    function watchLedgerRoute() {
      if (routeWatchStarted) return;
      routeWatchStarted = true;
      const deadline = performance.now() + 10_000;

      function check() {
        if (isLedgerPath(location.pathname)) {
          requestAnimationFrame(() => {
            ledgerVisible = performance.now();
            record("ledger-visible", { at: rounded(ledgerVisible) });
          });
          return;
        }
        if (performance.now() < deadline) {
          requestAnimationFrame(check);
        } else {
          record("ledger-timeout", { at: rounded(performance.now()) });
        }
      }

      requestAnimationFrame(check);
    }

    addEventListener(
      "pointerdown",
      (event) => {
        if (ledgerPointerDown !== null || !isLedgerTabEvent(event)) return;
        const receivedAt = performance.now();
        const occurredAt = eventOccurredAt(event);
        ledgerPointerDown = { occurredAt, receivedAt };
        record("ledger-pointerdown", {
          occurredAt: rounded(occurredAt),
          receivedAt: rounded(receivedAt),
          inputDelay:
            occurredAt === null ? null : rounded(Math.max(0, receivedAt - occurredAt)),
          pointerType: event.pointerType,
        });
        watchLedgerRoute();
      },
      { capture: true, passive: true },
    );

    addEventListener(
      "click",
      (event) => {
        if (ledgerClick !== null || !isLedgerTabEvent(event)) return;
        ledgerClick = performance.now();
        record("ledger-click", { receivedAt: rounded(ledgerClick) });
      },
      { capture: true, passive: true },
    );

    function safeSummary() {
      const longTasks = records.filter((entry) => entry.event === "longtask");
      const durations = longTasks.map((entry) => entry.duration);
      const total = durations.reduce((sum, duration) => sum + duration, 0);
      const firstEventAt = ledgerPointerDown?.occurredAt ?? null;
      const receivedAt = ledgerPointerDown?.receivedAt ?? null;
      const status = ledgerVisible !== null ? "navigated" : "not observed";

      return JSON.stringify(
        {
          benchmark: "yaccount-stage-2-baseline",
          session,
          elapsedAtReport: rounded(performance.now()),
          longTaskSupported: supportedEntryTypes.includes("longtask"),
          longTaskCount: longTasks.length,
          longTaskTotal: rounded(total),
          longTaskMaximum: durations.length ? rounded(Math.max(...durations)) : 0,
          longTasks: longTasks.map(({ startTime, duration, endTime }) => ({
            startTime,
            duration,
            endTime,
          })),
          firstTap: {
            pointerDownObserved: ledgerPointerDown !== null,
            clickObserved: ledgerClick !== null,
            inputDelay:
              firstEventAt === null || receivedAt === null
                ? null
                : rounded(Math.max(0, receivedAt - firstEventAt)),
            tapToLedger:
              firstEventAt === null || ledgerVisible === null
                ? null
                : rounded(Math.max(0, ledgerVisible - firstEventAt)),
            status,
          },
        },
        null,
        2,
      );
    }

    function mountResultsPanel() {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Safe benchmark";
      button.style.cssText =
        "position:fixed;top:4px;right:4px;z-index:2147483647;padding:6px 10px;border:1px solid #777;border-radius:999px;background:#fff;color:#111;font:12px system-ui";

      button.addEventListener("click", () => {
        document.getElementById("tap-perf-results")?.remove();
        const result = safeSummary();

        const panel = document.createElement("div");
        panel.id = "tap-perf-results";
        panel.style.cssText =
          "position:fixed;inset:12px;z-index:2147483647;display:flex;flex-direction:column;gap:8px;padding:12px;background:#fff;color:#111;border:1px solid #777;border-radius:12px";

        const textarea = document.createElement("textarea");
        textarea.readOnly = true;
        textarea.value = result;
        textarea.style.cssText =
          "min-height:0;flex:1;width:100%;padding:8px;font:11px ui-monospace,monospace";

        const actions = document.createElement("div");
        actions.style.cssText = "display:flex;gap:8px";

        const copy = document.createElement("button");
        copy.type = "button";
        copy.textContent = "Copy safe result";
        copy.style.cssText = "padding:8px 12px;border:1px solid #777;border-radius:8px";
        copy.addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(result);
            copy.textContent = "Copied";
          } catch {
            textarea.select();
            copy.textContent = "Selected — tap Copy";
          }
        });

        const close = document.createElement("button");
        close.type = "button";
        close.textContent = "Close";
        close.style.cssText = "padding:8px 12px;border:1px solid #777;border-radius:8px";
        close.addEventListener("click", () => panel.remove());

        actions.append(copy, close);
        panel.append(textarea, actions);
        document.body.append(panel);
      });

      document.body.append(button);
    }

    if (document.readyState === "loading") {
      addEventListener("DOMContentLoaded", mountResultsPanel, { once: true });
    } else {
      mountResultsPanel();
    }

    if (!supportedEntryTypes.includes("longtask")) {
      record("longtask-unsupported", { session, supportedEntryTypes });
      return;
    }

    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration <= 50) continue;

        record("longtask", {
          session,
          name: entry.name,
          startTime: Number(entry.startTime.toFixed(1)),
          duration: Number(entry.duration.toFixed(1)),
          endTime: Number((entry.startTime + entry.duration).toFixed(1)),
        });
      }
    });

    observer.observe({ type: "longtask", buffered: true });
    addEventListener("pagehide", () => observer.disconnect(), { once: true });
  })();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(geist.variable, geistMono.variable, fraunces.variable)}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: longTaskObserverScript }} />
      </head>
      <body className="bg-background min-h-screen font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <RepoBootstrap>
            <AppShell>{children}</AppShell>
            <Toaster />
          </RepoBootstrap>
        </ThemeProvider>
      </body>
    </html>
  );
}
