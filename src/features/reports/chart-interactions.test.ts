import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const source = readFileSync(new URL("./widgets.tsx", import.meta.url), "utf8");
const dashboardSource = readFileSync(
  new URL("./dashboard-widgets.tsx", import.meta.url),
  "utf8",
);
const dashboardView = readFileSync(
  new URL("./DashboardView.tsx", import.meta.url),
  "utf8",
);
const styles = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

it("uses native Recharts geometry animations", () => {
  const dataShapes = source.match(/<(?:Pie|Bar|Line)\b[\s\S]*?>/g) ?? [];

  expect(dataShapes).toHaveLength(11);
  expect(
    dataShapes.filter((shape) => !shape.includes('isAnimationActive="auto"')),
  ).toEqual([]);
  expect(source).not.toContain("isAnimationActive={false}");
});

it("makes native animation updates interruptible", () => {
  const containers = `${source}\n${dashboardSource}`.match(
    /<ResponsiveContainer\b[\s\S]*?>/g,
  );

  expect(containers).toHaveLength(6);
  expect(containers?.some((container) => container.includes("chart-enter"))).toBe(false);
  expect(styles).not.toContain("@keyframes chart-enter");
  expect(dashboardView).toContain("AnimationControllerProvider");
  expect(dashboardView).toContain("interruptibleAnimationController");
});
