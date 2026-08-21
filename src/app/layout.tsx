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

const sheetTraceScript = String.raw`
  (() => {
    const session = Math.random().toString(36).slice(2);
    const viewportEvents = [];
    const styleWrites = [];
    let styleCommitCount = 0;
    let active = false;
    let startedAt = null;
    let observer = null;
    let target = null;
    let resultTimer = null;
    let statusNode = null;

    function rounded(value) {
      return Number(value.toFixed(2));
    }

    function sample(event) {
      const visual = window.visualViewport;
      return {
        event,
        elapsed: startedAt === null ? 0 : rounded(performance.now() - startedAt),
        height: visual ? rounded(visual.height) : null,
        offsetTop: visual ? rounded(visual.offsetTop) : null,
        innerHeight: window.innerHeight,
      };
    }

    function recordViewport(event) {
      const entry = sample(event);
      viewportEvents.push(entry);
      console.info("[sheet-trace] viewport", JSON.stringify(entry));
    }

    function stopTrace() {
      observer?.disconnect();
      observer = null;
      window.visualViewport?.removeEventListener("resize", onViewportResize);
      window.visualViewport?.removeEventListener("scroll", onViewportScroll);
      window.removeEventListener("resize", onWindowResize);
      window.removeEventListener("focusin", onFieldFocus, true);
      if (resultTimer !== null) clearTimeout(resultTimer);
      resultTimer = null;
      active = false;
    }

    function onViewportResize() {
      recordViewport("visual-resize");
    }

    function onViewportScroll() {
      recordViewport("visual-scroll");
    }

    function onWindowResize() {
      recordViewport("window-resize");
    }

    function onFieldFocus(event) {
      if (
        !active ||
        !target?.contains(event.target) ||
        !(event.target instanceof Element) ||
        !event.target.matches("input, textarea, select")
      )
        return;
      if (statusNode) statusNode.textContent = "Recording sheet trace";
      if (resultTimer !== null) clearTimeout(resultTimer);
      resultTimer = setTimeout(() => {
        if (statusNode) showResults(statusNode);
      }, 2000);
    }

    function arm(button) {
      target = document.querySelector(
        '[data-slot="sheet-content"][data-side="bottom"]',
      );
      if (!target) {
        button.textContent = "Open a bottom sheet first";
        setTimeout(() => {
          button.textContent = "Arm sheet trace";
        }, 1600);
        return;
      }

      document.getElementById("sheet-trace-results")?.remove();
      viewportEvents.length = 0;
      styleWrites.length = 0;
      styleCommitCount = 0;
      startedAt = performance.now();
      recordViewport("trace-start");

      observer = new MutationObserver((mutations) => {
        const commit = ++styleCommitCount;
        for (const mutation of mutations) {
          const entry = {
            ...sample("style-write"),
            commit,
            oldStyle: mutation.oldValue,
            style: target?.getAttribute("style") ?? null,
          };
          styleWrites.push(entry);
          console.info("[sheet-trace] style", JSON.stringify(entry));
        }
      });
      observer.observe(target, {
        attributes: true,
        attributeFilter: ["style"],
        attributeOldValue: true,
      });

      window.visualViewport?.addEventListener("resize", onViewportResize, {
        passive: true,
      });
      window.visualViewport?.addEventListener("scroll", onViewportScroll, {
        passive: true,
      });
      window.addEventListener("resize", onWindowResize, { passive: true });
      window.addEventListener("focusin", onFieldFocus, true);
      active = true;
      button.textContent = "Sheet trace ready";
    }

    function traceResult() {
      return JSON.stringify(
        {
          benchmark: "yaccount-stage-3-after",
          session,
          elapsedAtReport:
            startedAt === null ? null : rounded(performance.now() - startedAt),
          visualViewportSupported: Boolean(window.visualViewport),
          viewportResizeCount: viewportEvents.filter(
            (entry) => entry.event === "visual-resize",
          ).length,
          styleCommitCount,
          styleWriteCount: styleWrites.length,
          viewportEvents,
          styleWrites,
        },
        null,
        2,
      );
    }

    function showResults(button) {
      stopTrace();
      const result = traceResult();
      document.getElementById("sheet-trace-results")?.remove();

      const panel = document.createElement("div");
      panel.id = "sheet-trace-results";
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
      copy.style.cssText =
        "padding:8px 12px;border:1px solid #777;border-radius:8px";
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
      close.style.cssText =
        "padding:8px 12px;border:1px solid #777;border-radius:8px";
      close.addEventListener("click", () => panel.remove());

      actions.append(copy, close);
      panel.append(textarea, actions);
      document.body.append(panel);
      button.textContent = "Sheet trace complete";
    }

    function mountTraceButton() {
      const button = document.createElement("div");
      button.textContent = "Open a bottom sheet";
      button.style.cssText =
        "position:fixed;top:4px;left:4px;z-index:2147483647;padding:6px 10px;border:1px solid #777;border-radius:999px;background:#fff;color:#111;font:12px system-ui";
      statusNode = button;
      document.body.append(button);

      const sheetPoll = setInterval(() => {
        const sheet = document.querySelector(
          '[data-slot="sheet-content"][data-side="bottom"]',
        );
        if (!sheet) return;
        clearInterval(sheetPoll);
        button.textContent = "Preparing sheet trace";
        setTimeout(() => arm(button), 600);
      }, 100);
    }

    if (document.readyState === "loading") {
      addEventListener("DOMContentLoaded", mountTraceButton, { once: true });
    } else {
      mountTraceButton();
    }
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
        <script dangerouslySetInnerHTML={{ __html: sheetTraceScript }} />
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
