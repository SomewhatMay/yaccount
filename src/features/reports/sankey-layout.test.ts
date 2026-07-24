import { describe, it, expect } from "vitest";
// Deep import on purpose: `computeData` is recharts' Sankey layout pass and is
// not in the package's public export. This is the ONE place in the app where a
// hand-built data structure is handed to a chart library that then has to solve
// a layout over it — everything else feeds recharts a plain array of rows. Until
// Playwright arrives (phase 9) there is no other automated proof that the
// diagram renders at all, so the deep path earns its keep. If a recharts upgrade
// moves it, fix the import; do not delete the test.
import { computeData } from "recharts/es6/chart/Sankey";
import { makeCategory, makeTransaction, type Transaction } from "@/core/model";
import { sankeyFlows } from "@/core/engine";

const cats = [
  makeCategory({ name: "Salary", type: "income", id: "sal" }),
  makeCategory({ name: "Side gig", type: "income", id: "gig" }),
  makeCategory({ name: "Housing", type: "expense", id: "hou" }),
  makeCategory({ name: "Food", type: "expense", id: "food" }),
];
const range = { start: "2026-07-01", end: "2026-07-31" };

const tx = (amount: number, category_id: string) =>
  makeTransaction({ date: "2026-07-05", amount, vendor_source: "x", category_id });

/** Run the real layout over what the engine produces, at a phone's width.
 *  Its shape is declared in `recharts-sankey.d.ts`. */
function layout(rows: Transaction[]) {
  const flows = sankeyFlows(rows, cats, range);
  return computeData({
    data: {
      // recharts mutates what it is given, exactly as the widget guards against.
      nodes: flows.nodes.map((n) => ({ ...n })),
      links: flows.links.map((l) => ({ ...l })),
    },
    width: 310,
    height: 300,
    iterations: 32,
    nodeWidth: 9,
    nodePadding: 16,
    sort: true,
    verticalAlign: "justify",
    align: "justify",
  });
}

/** Every node landed somewhere real and is tall enough to draw. */
function laysOut(nodes: readonly { x: number; y: number; dy: number }[]): boolean {
  return nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y) && n.dy > 0);
}

describe("recharts can lay out what sankeyFlows produces", () => {
  it("a surplus period: sources → hub → sinks, in three columns", () => {
    const { nodes, links } = layout([
      tx(500000, "sal"),
      tx(100000, "gig"),
      tx(-180000, "hou"),
      tx(-40000, "food"),
    ]);
    expect(nodes).toHaveLength(6); // 2 income + hub + 2 expense + Saved
    expect(links).toHaveLength(5);
    expect(laysOut(nodes)).toBe(true);
    // The hub is what keeps this readable: without it every income would fan to
    // every expense, implying a link no ledger row supports.
    expect(new Set(nodes.map((n) => n.depth)).size).toBe(3);
  });

  it("an overspent period, where the shortfall enters the hub as a drawdown", () => {
    const { nodes } = layout([tx(100000, "sal"), tx(-150000, "hou")]);
    expect(nodes.map((n) => n.name)).toEqual([
      "Salary",
      "Savings",
      "All income",
      "Housing",
    ]);
    expect(laysOut(nodes)).toBe(true);
  });

  it("spending with no income at all — the diagram is entirely drawdown", () => {
    const { nodes } = layout([tx(-150000, "hou")]);
    expect(laysOut(nodes)).toBe(true);
  });
});
