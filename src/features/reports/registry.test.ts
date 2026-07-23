import { describe, it, expect } from "vitest";
import { DASHBOARD_WIDGETS } from "./registry";

/**
 * A widget's `id` is not a label — it is a stored preference key. Rename one and
 * every reader who folded that widget away, or gave it its own reporting window,
 * silently gets the default back with no way to tell why. These are the same
 * guards `nav.test.ts` puts on the destination registry, for the same reason.
 */
describe("the dashboard widget registry", () => {
  it("has unique ids", () => {
    const ids = DASHBOARD_WIDGETS.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps the ids the stored preferences are keyed by", () => {
    // Changing this list is changing where people's folds and per-widget periods
    // live. Add freely; rename nothing.
    expect(DASHBOARD_WIDGETS.map((w) => w.id)).toEqual([
      "saved",
      "kpis",
      "pace",
      "flow",
      "calendar",
      "breakdown",
      "payees",
      "upcoming",
      "largest",
      "goals",
      "monthly",
      "waterfall",
      "trend",
      "flows",
      "investments",
      "budgets",
    ]);
  });

  it("gives every widget something to render and a name to render it under", () => {
    for (const w of DASHBOARD_WIDGETS) {
      expect(w.title.trim(), `${w.id} needs a title`).not.toBe("");
      expect(typeof w.render, `${w.id} needs a render`).toBe("function");
    }
  });

  it("ships every widget visible — M11 folds them, it does not hide them", () => {
    expect(DASHBOARD_WIDGETS.every((w) => w.defaultVisible)).toBe(true);
  });

  it("only exempts a widget from the period control when its window is its meaning", () => {
    // Budget pace is about THIS month and Coming up about the next 30 days; a
    // period menu on either would be a control that does nothing.
    expect(DASHBOARD_WIDGETS.filter((w) => w.fixedWindow).map((w) => w.id)).toEqual([
      "pace",
      "upcoming",
    ]);
  });

  it("keeps the screen to one opening figure (§12.3: never two on a screen)", () => {
    const bare = DASHBOARD_WIDGETS.filter((w) => w.bare).map((w) => w.id);
    expect(bare).toEqual(["saved", "kpis"]);
    // …and they lead, so the panels below them read as detail.
    expect(DASHBOARD_WIDGETS.slice(0, bare.length).map((w) => w.id)).toEqual(bare);
  });
});
