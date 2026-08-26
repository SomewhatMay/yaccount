import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validateExport } from "./export";

const FIXTURE = resolve(
  process.cwd(),
  "test-data/yaccount-dashboard-widget-lab-2026-08-26.json",
);

const WIDGET_TYPES = [
  "allocation",
  "balance",
  "breakdown",
  "brief",
  "budgets",
  "calendar",
  "commitments",
  "flow",
  "flows",
  "goals",
  "investments",
  "landing",
  "largest",
  "money-map",
  "monthly",
  "pace",
  "payees",
  "recent",
  "resilience",
  "saved",
  "upcoming",
  "watch-category",
  "watch-container",
  "waterfall",
];

describe("dashboard widget lab export", () => {
  it("is importable and visibly covers every registered widget type", async () => {
    const result = await validateExport(readFileSync(FIXTURE, "utf8"));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const settingRows = result.ops.flatMap((op) =>
      op.type === "setting.set" ? [op.payload.row] : [],
    );
    const dashboards = settingRows
      .filter((row) => row.key.startsWith("dashboard.v2.item."))
      .map(
        (row) =>
          JSON.parse(row.value) as {
            name: string;
            instances: {
              widgetType: string;
              hidden: boolean;
              subject?: { type: string; id: string };
              settings?: Record<string, unknown>;
            }[];
          },
      );
    const visibleTypes = new Set(
      dashboards.flatMap((dashboard) =>
        dashboard.instances.flatMap((instance) =>
          instance.hidden ? [] : [instance.widgetType],
        ),
      ),
    );

    expect(dashboards.map((dashboard) => dashboard.name)).toEqual([
      "01 · Planning",
      "02 · Forecast & Watch",
      "03 · Analysis",
      "04 · Compact",
    ]);
    expect([...visibleTypes].sort()).toEqual(WIDGET_TYPES);
  });

  it("includes the interaction modes and edge-state subjects", async () => {
    const result = await validateExport(readFileSync(FIXTURE, "utf8"));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const dashboardInstances = result.ops.flatMap((op) => {
      if (
        op.type !== "setting.set" ||
        !op.payload.row.key.startsWith("dashboard.v2.item.")
      ) {
        return [];
      }
      const dashboard = JSON.parse(op.payload.row.value) as {
        instances: {
          widgetType: string;
          subject?: { type: string; id: string };
          settings?: Record<string, unknown>;
        }[];
      };
      return dashboard.instances;
    });

    expect(dashboardInstances).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          widgetType: "commitments",
          settings: { commitmentsMode: "regular" },
        }),
        expect.objectContaining({
          widgetType: "commitments",
          settings: { commitmentsMode: "irregular" },
        }),
        expect.objectContaining({
          widgetType: "upcoming",
          settings: { horizonDays: 60 },
        }),
        expect.objectContaining({
          widgetType: "allocation",
          settings: {
            allocationMode: "pay-cycle",
            payCycleAnchorRuleIds: ["rule-salary"],
          },
        }),
        expect.objectContaining({
          widgetType: "watch-container",
          subject: { type: "container", id: "old-wallet" },
        }),
      ]),
    );
  });
});
