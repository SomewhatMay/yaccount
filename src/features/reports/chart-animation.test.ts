import { expect, it } from "vitest";
import { barTransformOrigin } from "./chart-animation";

it("grows bars away from their zero axis", () => {
  expect(barTransformOrigin(120)).toBe("center bottom");
  expect(barTransformOrigin(-120)).toBe("center top");
  expect(barTransformOrigin([40, 100])).toBe("center bottom");
  expect(barTransformOrigin([40, -20])).toBe("center top");
});
