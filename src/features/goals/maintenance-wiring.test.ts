import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../store.ts", import.meta.url), "utf8");

describe("goal maintenance wiring", () => {
  it("settles completion and correction reopens through the shared pure policy", () => {
    expect(source).toContain("goalMaintenanceOps(goals, goalFacts, rules, today)");
    expect(source).toContain("await repo.dispatchMany(ops)");
  });
});
