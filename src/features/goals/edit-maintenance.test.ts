import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./GoalsView.tsx", import.meta.url), "utf8");

describe("goal edit maintenance", () => {
  it("settles goal status immediately after saving an edit", () => {
    expect(source).toMatch(
      /await dispatch\(updateGoal\(next\)\);\s+await maintainGoals\(\);/,
    );
  });

  it("scrolls the moved goal into view", () => {
    expect(source).toContain("flashRow({ id: next.id, scroll: true })");
  });
});
