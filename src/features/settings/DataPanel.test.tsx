import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("explains that local-only clearing requires signing out", () => {
  const source = readFileSync(new URL("./DataPanel.tsx", import.meta.url), "utf8");
  expect(source).toContain("sign out, then return to this page");
  expect(source).toContain("this device only");
});
