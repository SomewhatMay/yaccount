import { describe, expect, it } from "vitest";
import {
  makeBudgetTarget,
  makeCategory,
  makeRecurringRule,
  makeTransaction,
  type Category,
} from "@/core/model";
import { statsTransactions } from "./reporting";
import { budgetTriage } from "./budget-triage";

const spent = makeCategory({ id: "spent", name: "Spent", type: "expense" });
const projected = makeCategory({
  id: "projected",
  name: "Projected",
  type: "expense",
});
const watch = makeCategory({ id: "watch", name: "Watch", type: "expense" });
const onTrack = makeCategory({
  id: "on-track",
  name: "On track",
  type: "expense",
});
const categories = [spent, projected, watch, onTrack];

function target(categoryId: string, amount = 10_000, startDate = "2026-01-01") {
  return makeBudgetTarget({
    id: `target-${categoryId}-${startDate}`,
    category_id: categoryId,
    amount,
    start_date: startDate,
  });
}

function expense(
  id: string,
  categoryId: string,
  amount: number,
  date = "2026-08-05",
  options: { status?: "pending" | "approved"; ruleId?: string | null } = {},
) {
  return makeTransaction({
    id,
    date,
    amount: -amount,
    vendor_source: id,
    category_id: categoryId,
    inbox_status: options.status,
    recurring_rule_id: options.ruleId,
  });
}

function monthlyRule(id: string, categoryId: string, amount: number, day = 20) {
  return makeRecurringRule({
    id,
    frequency: "monthly",
    interval_config: { day_of_month: day },
    template_amount: -amount,
    template_vendor_source: id,
    template_category_id: categoryId,
    template_container_id: "general",
    start_date: "2026-01-01",
  });
}

describe("budgetTriage", () => {
  it("classifies and ranks actual overage, scheduled projection, Watch, then On track", () => {
    const result = budgetTriage(
      [
        expense("spent-row", spent.id, 11_000),
        expense("projected-row", projected.id, 2_000),
        expense("watch-row", watch.id, 9_000),
        expense("track-row", onTrack.id, 2_000),
      ],
      categories,
      categories.map((category) => target(category.id)),
      [monthlyRule("projected-bill", projected.id, 9_000)],
      "2026-08-06",
    );

    expect(result.rows.map((row) => [row.categoryId, row.status])).toEqual([
      [spent.id, "spent"],
      [projected.id, "projected"],
      [watch.id, "watch"],
      [onTrack.id, "on-track"],
    ]);
    expect(result.rows[1]).toMatchObject({
      spent: 2_000,
      scheduledRemaining: 9_000,
      linearProjection: null,
      projected: 11_000,
    });
    expect(result.counts).toEqual({
      needsAttention: 2,
      watch: 1,
      onTrack: 1,
    });
  });

  it("uses the budget in effect at month end and exact Watch boundaries", () => {
    const rows = budgetTriage(
      [expense("watch-row", watch.id, 17_999)],
      [watch],
      [target(watch.id, 10_000), target(watch.id, 20_000, "2026-08-20")],
      [],
      "2026-08-31",
    ).rows;

    expect(rows[0]).toMatchObject({
      budget: 20_000,
      spent: 17_999,
      projected: 17_999,
      status: "on-track",
    });
    expect(
      budgetTriage(
        [expense("watch-exact", watch.id, 18_000)],
        [watch],
        [target(watch.id, 20_000)],
        [],
        "2026-08-31",
      ).rows[0].status,
    ).toBe("watch");
  });

  it("uses linear pace from day seven, including leap-month and month-end clocks", () => {
    const feb = budgetTriage(
      [expense("feb-row", onTrack.id, 7_000, "2028-02-07")],
      [onTrack],
      [target(onTrack.id, 28_500)],
      [],
      "2028-02-07",
    ).rows[0];
    const done = budgetTriage(
      [expense("done-row", onTrack.id, 7_000, "2028-02-07")],
      [onTrack],
      [target(onTrack.id, 28_500)],
      [],
      "2028-02-29",
    ).rows[0];

    expect(feb).toMatchObject({
      elapsedDays: 7,
      daysInMonth: 29,
      linearProjection: 29_000,
      status: "projected",
    });
    expect(done).toMatchObject({
      elapsedDays: 29,
      linearProjection: 7_000,
      projected: 7_000,
      status: "on-track",
    });
  });

  it("nets refunds and treats a zero budget without spend as On track", () => {
    const zero = makeCategory({ id: "zero", name: "Zero", type: "expense" });
    const result = budgetTriage(
      [
        expense("purchase", onTrack.id, 8_000),
        expense("refund", onTrack.id, -3_000, "2026-08-06"),
      ],
      [onTrack, zero],
      [target(onTrack.id, 20_000), target(zero.id, 0)],
      [],
      "2026-08-31",
    );

    expect(result.rows.find((row) => row.categoryId === onTrack.id)).toMatchObject({
      spent: 5_000,
      remaining: 15_000,
    });
    expect(result.rows.find((row) => row.categoryId === zero.id)).toMatchObject({
      spent: 0,
      projected: 0,
      status: "on-track",
    });
  });

  it.each(["pending", "approved"] as const)(
    "lets a linked %s row replace its scheduled occurrence exactly once",
    (status) => {
      const bill = monthlyRule("bill", projected.id, 10_000);
      const linked = expense("linked", projected.id, 12_000, "2026-08-20", {
        status,
        ruleId: bill.id,
      });
      const row = budgetTriage(
        [expense("actual", projected.id, 5_000), linked],
        [projected],
        [target(projected.id, 30_000)],
        [bill],
        "2026-08-10",
      ).rows[0];

      expect(row.spent).toBe(5_000);
      expect(row.scheduledRemaining).toBe(12_000);
      expect(row.scheduled).toEqual([
        expect.objectContaining({
          date: "2026-08-20",
          amount: 12_000,
          source: status === "pending" ? "pending" : "approved-future",
        }),
      ]);
    },
  );

  it("excludes archived, income, and statistically hidden budget categories", () => {
    const hidden: Category = {
      ...makeCategory({ id: "hidden", name: "Hidden", type: "expense" }),
      excluded_from_stats: true,
    };
    const archived: Category = {
      ...makeCategory({ id: "archived", name: "Archived", type: "expense" }),
      is_archived: true,
    };
    const income = makeCategory({ id: "income", name: "Income", type: "income" });
    const txns = [expense("hidden-row", hidden.id, 20_000)];
    const result = budgetTriage(
      statsTransactions(txns, [hidden, archived, income, onTrack]),
      [hidden, archived, income, onTrack],
      [target(hidden.id), target(archived.id), target(income.id), target(onTrack.id)],
      [monthlyRule("hidden-rule", hidden.id, 20_000)],
      "2026-08-10",
    );

    expect(result.rows.map((row) => row.categoryId)).toEqual([onTrack.id]);
  });
});
