import { expect, it } from "vitest";
import { createDashboardAggregates } from "./dashboard-aggregates";
import type { DashboardWidgetEntry } from "./dashboard-layout";
import { buildWidgetGallery } from "./widget-gallery";
import type { WidgetContext, WidgetDef } from "./registry";

const context = {
  range: { start: "2026-08-01", end: "2026-08-31" },
  today: "2026-08-23",
  categories: [],
  containers: [],
  ledgerTransactions: [],
  reportTransactions: [],
  budgetTargets: [],
  snapshots: [],
  recurringRules: [],
  goals: [],
  aggregates: createDashboardAggregates({
    categories: [],
    containers: [],
    ledgerTransactions: [],
    reportTransactions: [],
    recurringRules: [],
  }),
} satisfies WidgetContext;

function def(fields: Partial<WidgetDef> & Pick<WidgetDef, "id" | "title">): WidgetDef {
  return {
    description: "Plain description",
    defaultVisible: false,
    gallery: { group: "analysis", terms: [] },
    render: () => null,
    ...fields,
  };
}

function entry(widget: WidgetDef, hidden: boolean): DashboardWidgetEntry {
  return {
    def: widget,
    instance: {
      instanceId: `${widget.id}-1`,
      widgetType: widget.id,
      size: "expanded",
      hidden,
    },
  };
}

it("searches title, description, and recognition terms", () => {
  const bills = def({
    id: "bills",
    title: "Commitments",
    description: "Recurring obligations ahead.",
    gallery: { group: "planning", terms: ["bill", "subscription"] },
  });
  const income = def({
    id: "income",
    title: "Income resilience",
    description: "Monthly source stability.",
    gallery: { group: "forecasts", terms: ["paycheck"] },
  });

  expect(buildWidgetGallery([bills, income], [], [], context, "bill").items).toHaveLength(
    1,
  );
  expect(
    buildWidgetGallery([bills, income], [], [], context, "paycheck").items[0].def.id,
  ).toBe("income");
  expect(
    buildWidgetGallery([bills, income], [], [], context, "monthly source").items[0].def
      .id,
  ).toBe("income");
});

it("separates suggestions, grouped choices, and directed setup states", () => {
  const suggested = def({
    id: "goals",
    title: "Goal outlook",
    gallery: {
      group: "planning",
      terms: ["goal"],
      suggest: () => "2 active goals; see pace and dates",
    },
  });
  const grouped = def({
    id: "change",
    title: "What changed",
    gallery: { group: "analysis", terms: ["compare"] },
  });
  const setup = def({
    id: "commitments",
    title: "Commitments",
    gallery: { group: "planning", terms: ["bill"] },
    availability: () => ({
      status: "needs-setup",
      title: "Add a recurring item",
      description: "A dated rule unlocks this widget.",
      action: { label: "Set up recurring", href: "/recurring" },
    }),
  });

  const gallery = buildWidgetGallery([suggested, grouped, setup], [], [], context, "");

  expect(gallery.sections.map((section) => section.id)).toEqual([
    "suggested",
    "analysis",
    "needs-setup",
  ]);
  expect(gallery.sections[0].items[0].suggestion).toContain("2 active goals");
  expect(gallery.sections[2].items[0].availability).toMatchObject({
    status: "needs-setup",
    action: { href: "/recurring" },
  });
});

it("restores hidden instances and creates only missing or repeatable types", () => {
  const ordinary = def({ id: "ordinary", title: "Ordinary" });
  const watch = def({
    id: "watch-container",
    title: "Container watch",
    gallery: {
      group: "watch",
      terms: ["account"],
      repeatable: true,
      subject: "container",
    },
  });
  const entries = [entry(ordinary, true), entry(watch, false)];
  const gallery = buildWidgetGallery(
    [ordinary, watch],
    entries,
    ["ordinary-1"],
    context,
    "",
  );

  expect(gallery.items.map((item) => [item.def.id, item.mode])).toEqual([
    ["ordinary", "restore"],
    ["watch-container", "create"],
  ]);
  expect(gallery.items[1].subject).toBe("container");
});
