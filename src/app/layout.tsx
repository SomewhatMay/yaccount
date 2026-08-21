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
      timeOrigin: performance.timeOrigin,
      startedAt: performance.now(),
      path: location.pathname,
      supportedEntryTypes,
    });

    function mountResultsPanel() {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Perf logs";
      button.style.cssText =
        "position:fixed;top:4px;right:4px;z-index:2147483647;padding:6px 10px;border:1px solid #777;border-radius:999px;background:#fff;color:#111;font:12px system-ui";

      button.addEventListener("click", () => {
        document.getElementById("tap-perf-results")?.remove();

        const panel = document.createElement("div");
        panel.id = "tap-perf-results";
        panel.style.cssText =
          "position:fixed;inset:12px;z-index:2147483647;display:flex;flex-direction:column;gap:8px;padding:12px;background:#fff;color:#111;border:1px solid #777;border-radius:12px";

        const textarea = document.createElement("textarea");
        textarea.readOnly = true;
        textarea.value = JSON.stringify(records, null, 2);
        textarea.style.cssText =
          "min-height:0;flex:1;width:100%;padding:8px;font:11px ui-monospace,monospace";

        const actions = document.createElement("div");
        actions.style.cssText = "display:flex;gap:8px";

        const select = document.createElement("button");
        select.type = "button";
        select.textContent = "Select all";
        select.style.cssText = "padding:8px 12px;border:1px solid #777;border-radius:8px";
        select.addEventListener("click", () => textarea.select());

        const close = document.createElement("button");
        close.type = "button";
        close.textContent = "Close";
        close.style.cssText = "padding:8px 12px;border:1px solid #777;border-radius:8px";
        close.addEventListener("click", () => panel.remove());

        actions.append(select, close);
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
          path: location.pathname,
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
