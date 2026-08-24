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
      "money-map",
      "pace",
      "recent",
      "saved",
      "kpis",
      "flow",
      "calendar",
      "breakdown",
      "payees",
      "upcoming",
      "allocation",
      "largest",
      "goals",
      "landing",
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

  it("gives every addable widget a user-question group and recognition terms", () => {
    for (const widget of DASHBOARD_WIDGETS.filter(
      (candidate) => candidate.id !== "balance",
    )) {
      expect(widget.gallery?.group, `${widget.id} needs a gallery group`).toMatch(
        /^(planning|forecasts|watch|analysis)$/,
      );
      expect(widget.gallery?.terms, `${widget.id} needs recognition terms`).toBeDefined();
    }
  });

  it("keeps optional analysis off the initial dashboard", () => {
    expect(
      DASHBOARD_WIDGETS.filter((widget) => !widget.defaultVisible).map(
        (widget) => widget.id,
      ),
    ).toEqual(["money-map"]);
  });

  it("absorbs saved-period reporting into What changed under the stable id", () => {
    const changed = DASHBOARD_WIDGETS.find((widget) => widget.id === "saved");

    expect(changed).toMatchObject({
      title: "What changed",
      defaultVisible: true,
    });
    expect(changed?.loadCompact).toBeTypeOf("function");
    expect(changed?.math).toBeTypeOf("function");
  });

  it("replaces Budget pace with Budget triage under the stable id", () => {
    const triage = DASHBOARD_WIDGETS.find((widget) => widget.id === "pace");

    expect(triage).toMatchObject({
      title: "Budget triage",
      defaultVisible: true,
      fixedWindow: true,
    });
    expect(triage?.loadCompact).toBeTypeOf("function");
    expect(triage?.math).toBeTypeOf("function");
    expect(triage?.availability).toBeTypeOf("function");
  });

  it("replaces Goals with Goal outlook under the stable id", () => {
    const goals = DASHBOARD_WIDGETS.find((widget) => widget.id === "goals");

    expect(goals).toMatchObject({
      title: "Goal outlook",
      defaultVisible: true,
      fixedWindow: true,
    });
    expect(goals?.loadCompact).toBeTypeOf("function");
    expect(goals?.math).toBeTypeOf("function");
    expect(goals?.availability).toBeTypeOf("function");
  });

  it("replaces Coming up with Cash horizon under the stable id", () => {
    const horizon = DASHBOARD_WIDGETS.find((widget) => widget.id === "upcoming");

    expect(horizon).toMatchObject({
      title: "Cash horizon",
      defaultVisible: true,
      fixedWindow: true,
    });
    expect(horizon?.loadCompact).toBeTypeOf("function");
    expect(horizon?.math).toBeTypeOf("function");
    expect(horizon?.availability).toBeTypeOf("function");
  });

  it("adds Allocation plan as a fixed-current planning widget", () => {
    const allocation = DASHBOARD_WIDGETS.find((widget) => widget.id === "allocation");

    expect(allocation).toMatchObject({
      title: "Allocation plan",
      defaultVisible: true,
      fixedWindow: true,
    });
    expect(allocation?.loadCompact).toBeTypeOf("function");
    expect(allocation?.math).toBeTypeOf("function");
    expect(allocation?.availability).toBeTypeOf("function");
  });

  it("adds Month landing as a fixed-current forecast widget", () => {
    const landing = DASHBOARD_WIDGETS.find((widget) => widget.id === "landing");

    expect(landing).toMatchObject({
      title: "Month landing",
      defaultVisible: true,
      fixedWindow: true,
    });
    expect(landing?.loadCompact).toBeTypeOf("function");
    expect(landing?.math).toBeTypeOf("function");
    expect(landing?.availability).toBeTypeOf("function");
  });

  it("only exempts a widget from the period control when its window is its meaning", () => {
    // Current/recent facts are not period reports; pace and upcoming carry their
    // own windows. A period menu on any of them would be a control that lies.
    expect(DASHBOARD_WIDGETS.filter((w) => w.fixedWindow).map((w) => w.id)).toEqual([
      "balance",
      "money-map",
      "pace",
      "recent",
      "upcoming",
      "allocation",
      "goals",
      "landing",
    ]);
  });

  it("leads with current balance as the sole opening figure", () => {
    const bare = DASHBOARD_WIDGETS.filter((w) => w.bare).map((w) => w.id);
    expect(bare).toEqual(["balance", "kpis"]);
    expect(DASHBOARD_WIDGETS[0].id).toBe("balance");
  });

  it("puts budget pace directly below overall balance", () => {
    expect(
      DASHBOARD_WIDGETS.filter((widget) => widget.defaultVisible)
        .slice(0, 3)
        .map((widget) => widget.id),
    ).toEqual(["balance", "pace", "recent"]);
  });
});
