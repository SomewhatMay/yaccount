import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validateExport } from "./export";
import { replay } from "@/core/oplog";
import { STORE } from "@/core/repo/db";
import type { Setting, Transaction } from "@/core/model";
import { activeRows, pendingRows } from "@/core/engine/ledger";
import {
  defaultPresetId,
  distributionPieces,
  groupBreakdown,
  listPresets,
} from "@/core/engine/distribution";
import { DASHBOARD_WIDGETS } from "@/features/reports/registry";
import { CATEGORY_ICONS } from "@/features/category-icons";

const DEMO_SAVE = resolve(process.cwd(), "public/demo-save/yaccount-demo-save.json");

describe("curated demo save", () => {
  it("is a complete importable export with every dashboard widget visible", async () => {
    const result = await validateExport(readFileSync(DEMO_SAVE, "utf8"));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const settings = result.ops.flatMap((op) =>
      op.type === "setting.set" ? [op.payload.row] : [],
    );
    const dashboards = settings
      .filter((setting) => setting.key.startsWith("dashboard.v2.item."))
      .map(
        (setting) =>
          JSON.parse(setting.value) as {
            rank: number;
            name: string;
            instances: { widgetType: string; hidden: boolean }[];
          },
      )
      .sort((a, b) => a.rank - b.rank);
    const visible = new Set(
      dashboards.flatMap((dashboard) =>
        dashboard.instances.flatMap((instance) =>
          instance.hidden ? [] : [instance.widgetType],
        ),
      ),
    );

    expect(dashboards.map((dashboard) => dashboard.name)).toEqual([
      "01 · Overview",
      "02 · Planning",
      "03 · Forecasts & Watch",
      "04 · Analysis",
    ]);
    expect([...visible].sort()).toEqual(DASHBOARD_WIDGETS.map(({ id }) => id).sort());
    expect(
      settings.find((setting) => setting.key === "dashboard.v2.default")?.value,
    ).toBe("demo-overview");
  });

  it("covers the connected data features across the app", async () => {
    const result = await validateExport(readFileSync(DEMO_SAVE, "utf8"));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const types = new Set(result.ops.map((op) => op.type));
    expect([...types]).toEqual(
      expect.arrayContaining([
        "template.create",
        "cravingWin.create",
        "goal.create",
        "recurringRule.create",
        "snapshot.record",
        "budgetTarget.set",
        "transaction.void",
      ]),
    );

    expect(result.ops.some((op) => op.type === "template.create")).toBe(true);
    expect(
      result.ops.some(
        (op) =>
          op.type === "transaction.create" && op.payload.row.inbox_status === "pending",
      ),
    ).toBe(true);
    expect(result.ops.some((op) => op.type === "cravingWin.create")).toBe(true);
    expect(
      result.ops.some(
        (op) => op.type === "goal.create" && op.payload.row.status === "completed",
      ),
    ).toBe(true);

    const frequencies = result.ops.flatMap((op) =>
      op.type === "recurringRule.create" ? [op.payload.row.frequency] : [],
    );
    expect([...new Set(frequencies)].sort()).toEqual([
      "annually",
      "biweekly",
      "custom",
      "daily",
      "monthly",
      "weekly",
    ]);

    const knownIcons = new Set(CATEGORY_ICONS.map(({ name }) => name));
    const categoryRows = result.ops.flatMap((op) =>
      op.type === "category.create" ? [op.payload.row] : [],
    );
    expect(
      categoryRows
        .filter((category) => category.icon !== null && !knownIcons.has(category.icon))
        .map((category) => [category.name, category.icon]),
    ).toEqual([]);

    const goals = result.ops.flatMap((op) =>
      op.type === "goal.create" ? [op.payload.row] : [],
    );
    expect([...new Set(goals.map((goal) => goal.kind))].sort()).toEqual([
      "reserve",
      "spend_down",
    ]);
    expect([...new Set(goals.map((goal) => goal.mode))].sort()).toEqual([
      "deadline",
      "fixed",
      "passive",
    ]);
    expect([...new Set(goals.map((goal) => goal.status))].sort()).toEqual([
      "active",
      "cancelled",
      "completed",
    ]);
    expect(goals.some((goal) => goal.is_archived)).toBe(true);

    const categoriesById = new Set(
      result.ops.flatMap((op) =>
        op.type === "category.create" ? [op.payload.row.id] : [],
      ),
    );
    const containersById = new Set(
      result.ops.flatMap((op) =>
        op.type === "container.create" ? [op.payload.row.id] : [],
      ),
    );
    const goalsById = new Map(goals.map((goal) => [goal.id, goal]));
    const transactions = result.ops.flatMap((op) =>
      op.type === "transaction.create" ||
      op.type === "transaction.void" ||
      op.type === "template.create"
        ? [op.payload.row]
        : [],
    );
    const transactionsById = new Map(
      transactions.map((transaction) => [transaction.id, transaction]),
    );

    expect(
      transactions.every(
        (transaction) =>
          (transaction.category_id === null ||
            categoriesById.has(transaction.category_id)) &&
          containersById.has(transaction.container_id) &&
          (transaction.to_container_id === null ||
            containersById.has(transaction.to_container_id)),
      ),
    ).toBe(true);
    expect(
      result.ops
        .filter((op) => op.type === "budgetTarget.set")
        .every((op) => categoriesById.has(op.payload.row.category_id)),
    ).toBe(true);
    expect(
      result.ops
        .filter((op) => op.type === "snapshot.record")
        .every((op) => containersById.has(op.payload.row.container_id)),
    ).toBe(true);
    expect(
      result.ops
        .filter((op) => op.type === "recurringRule.create")
        .every(
          (op) =>
            containersById.has(op.payload.row.template_container_id) &&
            (op.payload.row.template_category_id === null ||
              categoriesById.has(op.payload.row.template_category_id)) &&
            (op.payload.row.template_to_container_id === null ||
              containersById.has(op.payload.row.template_to_container_id)) &&
            (op.payload.row.linked_goal_id === null ||
              goalsById.has(op.payload.row.linked_goal_id)),
        ),
    ).toBe(true);

    const linkedWins = result.ops.flatMap((op) =>
      op.type === "cravingWin.create" && op.payload.row.goal_id !== null
        ? [op.payload.row]
        : [],
    );
    expect(
      linkedWins.every((win) => {
        const goal = goalsById.get(win.goal_id!);
        const transfer = transactionsById.get(win.transfer_transaction_id!);
        return (
          goal !== undefined &&
          transfer?.to_container_id === goal.container_id &&
          transfer.amount === -win.amount_kept
        );
      }),
    ).toBe(true);
  });

  it("showcases income distribution (plans/income-distribution.md)", async () => {
    const result = await validateExport(readFileSync(DEMO_SAVE, "utf8"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const state = await replay(result.ops);
    const settings = [...state.get(STORE.settings)!.values()] as Setting[];
    const presets = listPresets(settings);
    expect(presets.filter((p) => !p.archived).map((p) => p.name)).toEqual([
      "Freelance",
      "Paycheck",
    ]);
    expect(defaultPresetId(settings)).toBe(
      presets.find((p) => p.name === "Paycheck")?.id,
    );

    const rows = [...state.get(STORE.transactions)!.values()] as Transaction[];
    const live = activeRows(rows);
    const groups = distributionPieces(live);
    expect(groups.size).toBeGreaterThan(0);
    for (const [parentId, pieces] of groups) {
      const parent = live.find((t) => t.id === parentId)!;
      const lines = groupBreakdown(parent, pieces);
      expect(lines.reduce((sum, l) => sum + l.amount, 0)).toBe(parent.amount);
      expect(lines.every((l) => l.amount >= 0)).toBe(true);
    }

    const payday = rows.find((t) => t.is_template && t.template_name === "Payday");
    expect(payday?.distribution_preset_id).toBeTruthy();
    expect(pendingRows(rows).some((t) => t.distribution_preset_id !== null)).toBe(true);
  });
});
