import { isValidElement, type ReactElement, type ReactNode } from "react";
import { expect, it } from "vitest";
import { Line, LineChart } from "recharts";
import { InvestmentCard } from "./widgets";

function collectElements(node: ReactNode): ReactElement[] {
  if (Array.isArray(node)) return node.flatMap(collectElements);
  if (!isValidElement(node)) return [];
  const element = node as ReactElement<{ children?: ReactNode }>;
  return [element, ...collectElements(element.props.children)];
}

it("draws investment series with a natural smooth curve", () => {
  const tree = InvestmentCard({ report: investmentReport });

  const lines = collectElements(tree).filter((element) => element.type === Line);

  expect(lines).toHaveLength(2);
  expect(lines.map((line) => (line.props as { type?: string }).type)).toEqual([
    "natural",
    "natural",
  ]);
});

it("can show only investment gain/loss", () => {
  const tree = InvestmentCard({
    report: investmentReport,
    showDifferenceOnly: true,
  });
  const lines = collectElements(tree).filter((element) => element.type === Line);
  const chart = collectElements(tree).find((element) => element.type === LineChart);

  expect(lines).toHaveLength(1);
  expect(lines[0]?.props).toMatchObject({
    dataKey: "difference",
    name: "Gain/loss",
    type: "natural",
  });
  expect(
    (chart?.props as { data: { difference: number }[] }).data.map(
      (point) => point.difference,
    ),
  ).toEqual([0, 10]);
});

const investmentReport = {
  containerId: "brokerage",
  name: "Brokerage",
  currentValue: 200,
  netContributions: 150,
  gainLoss: 50,
  firstSnapshotMonth: "2025-01",
  series: [
    { date: "2025-01-01", value: 100, contributed: 100 },
    { date: "2025-01-02", value: 120, contributed: 110 },
  ],
};
