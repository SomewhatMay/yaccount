import { describe, it, expect } from "vitest";
import { sparklinePath } from "@/features/ui/geometry";

/**
 * The history curve under the balance hero and the per-row sparklines are the
 * same geometry: a series normalized into a fixed box. It is pure, so it is
 * tested here rather than left to a browser check.
 */
describe("sparklinePath", () => {
  it("returns null for an empty series — there is nothing to draw", () => {
    expect(sparklinePath([])).toBeNull();
  });

  it("draws a single reading as a flat line across the box", () => {
    const g = sparklinePath([4200], { width: 100, height: 20 });
    expect(g).not.toBeNull();
    expect(g!.line).toBe("M0,10 L100,10");
  });

  it("draws a flat series at mid-height instead of dividing by a zero range", () => {
    const g = sparklinePath([500, 500, 500], { width: 100, height: 20 });
    expect(g!.line).toBe("M0,10 L50,10 L100,10");
    expect(g!.line).not.toContain("NaN");
  });

  it("spans the full width and inverts y so the largest value sits at the top", () => {
    const g = sparklinePath([0, 50, 100], { width: 100, height: 20 });
    // min → bottom (y = height), max → top (y = 0), midpoint in between.
    expect(g!.line).toBe("M0,20 L50,10 L100,0");
  });

  it("handles a falling series (a balance being spent down)", () => {
    const g = sparklinePath([100, 0], { width: 60, height: 10 });
    expect(g!.line).toBe("M0,0 L60,10");
  });

  it("closes the area path down to the baseline so it can be filled", () => {
    const g = sparklinePath([0, 100], { width: 100, height: 20 });
    expect(g!.area).toBe("M0,20 L100,0 L100,20 L0,20 Z");
  });

  it("insets the curve by the padding so a stroke is not clipped by the viewBox", () => {
    const g = sparklinePath([0, 100], { width: 100, height: 20, padding: 2 });
    expect(g!.line).toBe("M0,18 L100,2");
  });

  it("rounds coordinates so paths stay short and stable", () => {
    const g = sparklinePath([0, 1, 2], { width: 7, height: 3 });
    expect(g!.line).toBe("M0,3 L3.5,1.5 L7,0");
  });

  it("survives negative values — an overdrawn balance is still a reading", () => {
    const g = sparklinePath([-100, 0, 100], { width: 100, height: 20 });
    expect(g!.line).toBe("M0,20 L50,10 L100,0");
  });
});
