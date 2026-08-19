import { describe, expect, it } from "vitest";
import type { WidgetDef } from "./registry";
import {
  defaultDashboardLayout,
  encodeDashboardLayout,
  reorderDashboardLayout,
  resolveDashboardLayout,
  setWidgetVisible,
} from "./dashboard-layout";

function defs(...ids: string[]): WidgetDef[] {
  return ids.map((id) => ({
    id,
    title: id,
    defaultVisible: id !== "later",
    render: () => null,
  }));
}

const widgets = defs("balance", "pace", "recent", "later");

describe("dashboard layout", () => {
  it("starts in registry order and respects default visibility", () => {
    expect(defaultDashboardLayout(widgets)).toEqual({
      order: ["balance", "pace", "recent", "later"],
      hidden: ["later"],
    });
  });

  it("pins balance even if registry defaults drift", () => {
    expect(defaultDashboardLayout(defs("pace", "later", "balance"))).toEqual({
      order: ["balance", "pace", "later"],
      hidden: ["later"],
    });
  });

  it("round-trips stored order and visibility", () => {
    const stored = encodeDashboardLayout({
      order: ["balance", "recent", "pace", "later"],
      hidden: ["pace", "later"],
    });

    expect(resolveDashboardLayout(stored, widgets)).toEqual({
      order: ["balance", "recent", "pace", "later"],
      hidden: ["pace", "later"],
    });
  });

  it("falls back from malformed or unsupported preferences", () => {
    expect(resolveDashboardLayout("nope", widgets)).toEqual(
      defaultDashboardLayout(widgets),
    );
    expect(
      resolveDashboardLayout(
        JSON.stringify({ version: 2, order: [], hidden: [] }),
        widgets,
      ),
    ).toEqual(defaultDashboardLayout(widgets));
  });

  it("deduplicates known ids, drops unknown ids, and appends new widgets", () => {
    const stored = JSON.stringify({
      version: 1,
      order: ["recent", "ghost", "recent", "balance"],
      hidden: ["ghost", "pace", "pace"],
    });

    expect(resolveDashboardLayout(stored, widgets)).toEqual({
      order: ["balance", "recent", "pace", "later"],
      hidden: ["pace", "later"],
    });
  });

  it("forces balance visible and first", () => {
    const stored = encodeDashboardLayout({
      order: ["pace", "recent", "balance", "later"],
      hidden: ["balance", "recent"],
    });

    expect(resolveDashboardLayout(stored, widgets)).toEqual({
      order: ["balance", "pace", "recent", "later"],
      hidden: ["recent"],
    });
  });

  it("reorders widgets without allowing balance to move", () => {
    const initial = defaultDashboardLayout(widgets);
    expect(reorderDashboardLayout(initial, "recent", "pace")).toEqual({
      ...initial,
      order: ["balance", "recent", "pace", "later"],
    });
    expect(reorderDashboardLayout(initial, "balance", "recent")).toBe(initial);
  });

  it("changes visibility without allowing balance to hide", () => {
    const initial = defaultDashboardLayout(widgets);
    expect(setWidgetVisible(initial, "pace", false).hidden).toEqual(["later", "pace"]);
    expect(setWidgetVisible(initial, "later", true).hidden).toEqual([]);
    expect(setWidgetVisible(initial, "balance", false)).toBe(initial);
  });
});
