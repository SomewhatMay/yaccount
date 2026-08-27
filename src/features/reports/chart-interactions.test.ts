import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const source = readFileSync(new URL("./widgets.tsx", import.meta.url), "utf8");

it("keeps dashboard chart entrance work from competing with navigation", () => {
  const dataShapes = source.match(/<(?:Pie|Bar|Line)\b[\s\S]*?>/g) ?? [];

  expect(dataShapes).toHaveLength(11);
  expect(
    dataShapes.filter((shape) => !shape.includes("isAnimationActive={false}")),
  ).toEqual([]);
});
