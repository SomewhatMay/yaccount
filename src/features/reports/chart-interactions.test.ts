import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const source = readFileSync(new URL("./widgets.tsx", import.meta.url), "utf8");
const dashboardSource = readFileSync(
  new URL("./dashboard-widgets.tsx", import.meta.url),
  "utf8",
);
const styles = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

it("keeps dashboard chart entrance work from competing with navigation", () => {
  const dataShapes = source.match(/<(?:Pie|Bar|Line)\b[\s\S]*?>/g) ?? [];

  expect(dataShapes).toHaveLength(11);
  expect(
    dataShapes.filter((shape) => !shape.includes("isAnimationActive={false}")),
  ).toEqual([]);
});

it("restores chart motion without a JavaScript animation loop", () => {
  const containers = `${source}\n${dashboardSource}`.match(
    /<ResponsiveContainer\b[\s\S]*?>/g,
  );

  expect(containers).toHaveLength(6);
  expect(containers?.filter((container) => !container.includes("chart-enter"))).toEqual(
    [],
  );
  expect(styles).toContain("@keyframes chart-enter");
  expect(styles).toContain(
    "animation: chart-enter var(--dur-3) var(--ease-register) both;",
  );
  expect(styles).toContain("transform: translateY(0.25rem) scale(0.985)");
  expect(styles).toContain("opacity: 0");
});
