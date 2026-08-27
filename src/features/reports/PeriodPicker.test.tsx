import { expect, it, vi } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import type { ReportingPeriod } from "@/core/engine/period";
import { PeriodPicker, periodPickerLabel } from "./PeriodPicker";

function findComponents(node: ReactNode, name: string): ReactElement[] {
  if (Array.isArray(node)) return node.flatMap((child) => findComponents(child, name));
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [
    ...(typeof node.type === "function" && node.type.name === name ? [node] : []),
    ...findComponents(node.props.children, name),
  ];
}

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  if (!isValidElement<{ children?: ReactNode }>(node)) return "";
  return textOf(node.props.children);
}

const primary: ReportingPeriod = { kind: "preset", preset: "last-3-months" };
const compared: ReportingPeriod = { kind: "preset", preset: "last-month" };

it("summarizes primary and comparison windows in one period chip", () => {
  expect(periodPickerLabel(primary, null)).toBe("Last 3 months");
  expect(periodPickerLabel(primary, compared)).toBe("Last 3 months vs Last month");

  const tree = PeriodPicker({
    period: primary,
    onPeriodChange: vi.fn(),
    comparePeriod: compared,
    onCompareChange: vi.fn(),
  });

  expect(findComponents(tree, "Popover")).toHaveLength(1);
  expect(textOf(findComponents(tree, "PopoverTrigger")[0])).toBe(
    "Last 3 months vs Last month",
  );
});

it("configures comparison inside the period picker", () => {
  const tree = PeriodPicker({
    period: primary,
    onPeriodChange: vi.fn(),
    comparePeriod: compared,
    onCompareChange: vi.fn(),
  });
  const content = findComponents(tree, "PopoverContent")[0];

  expect(textOf(content)).toContain("Period");
  expect(textOf(content)).toContain("Compare periods");
  expect(textOf(content)).toContain("Compare with");
});
