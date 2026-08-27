import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import GlobalError from "@/app/global-error";
import { BootFailure } from "@/features/AppShell";
import { ErrorCard } from "@/features/ErrorBoundary";
import { DiagnosticsPanel } from "./DiagnosticsPanel";

describe("diagnostics access", () => {
  it("offers copy and download with one fixed logging policy", () => {
    const html = renderToStaticMarkup(<DiagnosticsPanel />);
    expect(html).toContain("Copy diagnostics");
    expect(html).toContain("Download diagnostics");
    expect(html).not.toContain("Log level");
    expect(html).toContain("local");
  });

  it("keeps full diagnostics available when the financial database cannot open", () => {
    const html = renderToStaticMarkup(<BootFailure detail="ledger database failed" />);
    expect(html).toContain("Copy diagnostics");
    expect(html).toContain("Download diagnostics");
    expect(html).toContain("local");
    expect(html).toContain("<details");
    expect(html).toContain("Details");
  });

  it("keeps build identity and full diagnostics in the root crash surface", () => {
    const html = renderToStaticMarkup(
      <GlobalError error={new Error("root failed")} reset={() => {}} />,
    );
    expect(html).toContain("Copy diagnostics");
    expect(html).toContain("Download diagnostics");
    expect(html).toContain("local");
    expect(html).toContain("<details");
    expect(html).toContain("Details");
  });

  it("keeps section crash detail behind a disclosure", () => {
    const html = renderToStaticMarkup(
      <ErrorCard
        error={new Error("technical stack")}
        resetErrorBoundary={() => {}}
        label="This section"
      />,
    );
    expect(html).toContain("<details");
    expect(html).toContain("Details");
  });
});
