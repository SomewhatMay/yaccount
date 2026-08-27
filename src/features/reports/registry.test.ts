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
      "brief",
      "money-map",
      "pace",
      "recent",
      "cravings",
      "saved",
      "flow",
      "calendar",
      "breakdown",
      "payees",
      "commitments",
      "upcoming",
      "allocation",
      "largest",
      "goals",
      "landing",
      "resilience",
      "watch-container",
      "watch-category",
      "monthly",
      "waterfall",
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

  it("marks optional and repeatable widgets outside the curated fallback", () => {
    expect(
      DASHBOARD_WIDGETS.filter((widget) => !widget.defaultVisible).map(
        (widget) => widget.id,
      ),
    ).toEqual([
      "money-map",
      "cravings",
      "saved",
      "flow",
      "calendar",
      "breakdown",
      "payees",
      "commitments",
      "largest",
      "resilience",
      "watch-container",
      "watch-category",
      "monthly",
      "waterfall",
      "flows",
      "investments",
      "budgets",
    ]);
  });

  it("absorbs saved-period reporting into What changed under the stable id", () => {
    const changed = DASHBOARD_WIDGETS.find((widget) => widget.id === "saved");

    expect(changed).toMatchObject({
      title: "What changed",
      defaultVisible: false,
    });
    expect(changed?.loadCompact).toBeTypeOf("function");
    expect(changed?.math).toBeTypeOf("function");
  });

  it("adds Money brief as the always-available fixed-current note", () => {
    const brief = DASHBOARD_WIDGETS.find((widget) => widget.id === "brief");

    expect(brief).toMatchObject({
      title: "Money brief",
      defaultVisible: true,
      fixedWindow: true,
    });
    expect(brief?.loadCompact).toBeTypeOf("function");
    expect(brief?.math).toBeTypeOf("function");
    expect(brief?.availability).toBeUndefined();
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

  it("adds Commitments as an optional fixed-current planning widget", () => {
    const commitments = DASHBOARD_WIDGETS.find((widget) => widget.id === "commitments");

    expect(commitments).toMatchObject({
      title: "Commitments",
      defaultVisible: false,
      fixedWindow: true,
    });
    expect(commitments?.loadCompact).toBeTypeOf("function");
    expect(commitments?.math).toBeTypeOf("function");
    expect(commitments?.availability).toBeTypeOf("function");
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

  it("adds Income resilience as a period-aware analysis widget", () => {
    const resilience = DASHBOARD_WIDGETS.find((widget) => widget.id === "resilience");

    expect(resilience).toMatchObject({
      title: "Income resilience",
      defaultVisible: false,
    });
    expect(resilience?.fixedWindow).not.toBe(true);
    expect(resilience?.loadCompact).toBeTypeOf("function");
    expect(resilience?.math).toBeTypeOf("function");
    expect(resilience?.availability).toBeTypeOf("function");
  });

  it("adds repeatable fixed-current Watch instance types", () => {
    const container = DASHBOARD_WIDGETS.find((widget) => widget.id === "watch-container");
    const category = DASHBOARD_WIDGETS.find((widget) => widget.id === "watch-category");

    expect(container).toMatchObject({
      title: "Container watch",
      defaultVisible: false,
      fixedWindow: true,
      gallery: { group: "watch", repeatable: true, subject: "container" },
    });
    expect(category).toMatchObject({
      title: "Category watch",
      defaultVisible: false,
      fixedWindow: true,
      gallery: { group: "watch", repeatable: true, subject: "category" },
    });
    for (const definition of [container, category]) {
      expect(definition?.loadCompact).toBeTypeOf("function");
      expect(definition?.math).toBeTypeOf("function");
    }
  });

  it("only exempts a widget from the period control when its window is its meaning", () => {
    // Current/recent facts are not period reports; pace and upcoming carry their
    // own windows. A period menu on any of them would be a control that lies.
    expect(DASHBOARD_WIDGETS.filter((w) => w.fixedWindow).map((w) => w.id)).toEqual([
      "balance",
      "brief",
      "money-map",
      "pace",
      "recent",
      "cravings",
      "commitments",
      "upcoming",
      "allocation",
      "goals",
      "landing",
      "watch-container",
      "watch-category",
    ]);
  });

  it("leads with current balance as the sole opening figure", () => {
    const bare = DASHBOARD_WIDGETS.filter((w) => w.bare).map((w) => w.id);
    expect(bare).toEqual([]);
    expect(DASHBOARD_WIDGETS[0].id).toBe("balance");
  });

  it("puts Money brief before Budget triage in the curated opening order", () => {
    expect(
      DASHBOARD_WIDGETS.filter((widget) => widget.defaultVisible)
        .slice(0, 3)
        .map((widget) => widget.id),
    ).toEqual(["balance", "brief", "pace"]);
  });
});
