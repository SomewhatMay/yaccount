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
      "balance",
      "pace",
      "recent",
      "saved",
      "kpis",
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

  it("keeps render modules behind lightweight loader descriptors", () => {
    for (const w of DASHBOARD_WIDGETS) {
      expect(w.title.trim(), `${w.id} needs a title`).not.toBe("");
      expect(w.description.trim(), `${w.id} needs a description`).not.toBe("");
      expect(typeof w.load, `${w.id} needs a loader`).toBe("function");
      expect(w.render, `${w.id} eagerly embeds a renderer`).toBeUndefined();
    }
  });

  it("ships every widget visible — M11 folds them, it does not hide them", () => {
    expect(DASHBOARD_WIDGETS.every((w) => w.defaultVisible)).toBe(true);
  });

  it("only exempts a widget from the period control when its window is its meaning", () => {
    // Current/recent facts are not period reports; pace and upcoming carry their
    // own windows. A period menu on any of them would be a control that lies.
    expect(DASHBOARD_WIDGETS.filter((w) => w.fixedWindow).map((w) => w.id)).toEqual([
      "balance",
      "pace",
      "recent",
      "upcoming",
    ]);
  });

  it("leads with current balance as the sole opening figure", () => {
    const bare = DASHBOARD_WIDGETS.filter((w) => w.bare).map((w) => w.id);
    expect(bare).toEqual(["balance", "kpis"]);
    expect(DASHBOARD_WIDGETS[0].id).toBe("balance");
  });

  it("puts budget pace directly below overall balance", () => {
    expect(DASHBOARD_WIDGETS.slice(0, 3).map((w) => w.id)).toEqual([
      "balance",
      "pace",
      "recent",
    ]);
  });
});
