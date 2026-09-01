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

it("renders final Recharts geometry without a JavaScript animation loop", () => {
  const dataShapes = source.match(/<(?:Pie|Bar|Line)\b[\s\S]*?>/g) ?? [];

  expect(dataShapes).toHaveLength(11);
  expect(
    dataShapes.filter((shape) => !shape.includes("isAnimationActive={false}")),
  ).toEqual([]);
  expect(dashboardView).not.toContain("AnimationControllerProvider");
  expect(dashboardView).not.toContain("interruptibleAnimationController");
});

it("uses browser-native motion for every formerly animated chart family", () => {
  const chartSource = `${source}\n${dashboardSource}`;

  expect(chartSource).toContain("chart-pie-enter");
  expect(chartSource.match(/chart-bar-enter/g)).toHaveLength(6);
  expect(chartSource.match(/chart-line-enter/g)).toHaveLength(4);
  expect(styles).toContain("@keyframes chart-pie-enter");
  expect(styles).toContain("@keyframes chart-bar-enter");
  expect(styles).toContain("@keyframes chart-line-enter");
  expect(styles).toContain("stroke-dashoffset");
  expect(styles).toContain("transform: scaleY(0)");
  expect(styles).toContain("clip-path: inset(0 100% 0 0)");
  expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
});
