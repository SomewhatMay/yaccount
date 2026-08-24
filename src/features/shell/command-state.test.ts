import { describe, expect, it } from "vitest";
import { needsCommandIndex } from "@/features/shell/command-state";

describe("needsCommandIndex", () => {
  it("does no full-data indexing for a closed or blank action page", () => {
    expect(needsCommandIndex(false, "coffee")).toBe(false);
    expect(needsCommandIndex(true, "")).toBe(false);
    expect(needsCommandIndex(true, "   ")).toBe(false);
  });

  it("starts indexing at the first real query", () => {
    expect(needsCommandIndex(true, "coffee")).toBe(true);
    expect(needsCommandIndex(true, "  $42 ")).toBe(true);
  });
});
