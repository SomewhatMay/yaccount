import { describe, it, expect } from "vitest";
import {
  makeContainer,
  makeDistributionPreset,
  makeTransaction,
  makeTransfer,
} from "@/core/model";
import { splitIncome } from "@/core/engine/distribution";
import { linesFromGroup, linesFromSplit } from "./lines";

const containers = [
  makeContainer({ id: "general", name: "General" }),
  makeContainer({ id: "savings", name: "Savings" }),
  { ...makeContainer({ id: "invest", name: "Invest" }), is_archived: true },
];
const preset = makeDistributionPreset({
  id: "p1",
  name: "Paycheck",
  rest_container_id: "general",
  parts: [
    { container_id: "savings", bps: 2000 },
    { container_id: "invest", bps: 3300 },
  ],
});

describe("linesFromSplit — a preview, in the preset's terms", () => {
  it("names each piece with its configured share and the rest with what's left", () => {
    const split = splitIncome(300000, preset, containers);
    if (!split.ok) throw new Error("split");
    const { lines, note } = linesFromSplit(split, preset, containers);
    expect(lines).toEqual([
      {
        containerId: "savings",
        name: "Savings",
        share: "20%",
        amount: 60000,
        rest: false,
      },
      {
        containerId: "general",
        name: "General",
        share: "80% rest",
        amount: 240000,
        rest: true,
      },
    ]);
    expect(note).toBe("Invest is archived — its share stays in General.");
  });

  it("lists a part that rounded to 0¢ at $0.00, so the user sees why", () => {
    const live = containers.map((c) => ({ ...c, is_archived: false }));
    const split = splitIncome(3, preset, live);
    if (!split.ok) throw new Error("split");
    const { lines, note } = linesFromSplit(split, preset, live);
    expect(lines.map((l) => [l.name, l.amount])).toEqual([
      ["Savings", 0],
      ["Invest", 0],
      ["General", 3],
    ]);
    expect(note).toBeNull();
  });
});

describe("linesFromGroup — what actually happened, read from the rows", () => {
  it("derives shares from the cents", () => {
    const parent = makeTransaction({
      id: "pay",
      date: "2026-10-01",
      amount: 300000,
      vendor_source: "Paycheck",
      category_id: "salary",
      container_id: "general",
    });
    const piece = makeTransfer({
      date: "2026-10-01",
      amount: 100000,
      container_id: "general",
      to_container_id: "savings",
      vendor_source: "Paycheck",
      distribution_parent_id: "pay",
    });
    expect(linesFromGroup(parent, [piece], containers)).toEqual([
      {
        containerId: "savings",
        name: "Savings",
        share: "33.3%",
        amount: 100000,
        rest: false,
      },
      {
        containerId: "general",
        name: "General",
        share: "66.7% rest",
        amount: 200000,
        rest: true,
      },
    ]);
  });
});
