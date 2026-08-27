import { expect, it } from "vitest";
import { formatCents } from "@/core/money";
import {
  makeContainer,
  makeContainerSnapshot,
  makeGeneralContainer,
  makeTransaction,
} from "@/core/model";
import { createDashboardAggregates } from "../dashboard-aggregates";
import type { WidgetContext } from "../registry";
import { MoneyMapCompact, MoneyMapExpanded } from "./MoneyMapWidget";

const general = makeGeneralContainer();
const brokerage = makeContainer({
  id: "brokerage",
  name: "Brokerage",
  is_investment: true,
});
const ledgerTransactions = [
  makeTransaction({
    id: "opening",
    date: "2026-08-01",
    amount: 12345,
    vendor_source: "Opening",
    category_id: "income",
  }),
];
const snapshots = [
  makeContainerSnapshot({
    id: "brokerage-snapshot",
    container_id: brokerage.id,
    date: "2026-08-21",
    reported_balance: 10000,
  }),
];
const aggregates = createDashboardAggregates({
  budgetTargets: [],
  categories: [],
  containers: [general, brokerage],
  ledgerTransactions,
  reportTransactions: ledgerTransactions,
  recurringRules: [],
  snapshots,
  goals: [],
});
const context = {
  range: { start: "2026-08-01", end: "2026-08-23" },
  today: "2026-08-23",
  categories: [],
  containers: [general, brokerage],
  ledgerTransactions,
  reportTransactions: ledgerTransactions,
  budgetTargets: [],
  snapshots,
  recurringRules: [],
  goals: [],
  aggregates,
} satisfies WidgetContext;

it("exposes the same tracked total in compact and expanded summaries", () => {
  const expanded = MoneyMapExpanded(context);
  const compact = MoneyMapCompact(context);
  const total = formatCents(22345);

  expect(expanded.props["aria-label"]).toContain(total);
  expect(compact.props["aria-label"]).toBe(expanded.props["aria-label"]);
});

it("renders the exact split and snapshot freshness without fake ledger links", () => {
  const expanded = MoneyMapExpanded(context);
  const compact = MoneyMapCompact(context);
  const source = JSON.stringify([expanded, compact]);

  expect(source).toContain("Counted in overall balance");
  expect(source).toContain("Investments");
  expect(source).toContain("Values current within 2 days");
  expect(source).not.toContain('"href"');
});
