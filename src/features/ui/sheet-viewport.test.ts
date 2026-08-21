import { describe, expect, it } from "vitest";
import { keyboardInset } from "@/features/ui/sheet-viewport";

describe("iOS bottom-sheet keyboard inset", () => {
  it("rounds real keyboard movement and ignores non-keyboard deltas", () => {
    expect(keyboardInset(800, 800)).toBe(0);
    expect(keyboardInset(800, 797)).toBe(0);
    expect(keyboardInset(800, 500)).toBe(300);

    const fractional = keyboardInset(800, 652.6666);
    expect(fractional).toBe(147);
    expect(Number.isInteger(fractional)).toBe(true);

    expect(keyboardInset(600, 700)).toBe(0);
  });

  it("turns the recorded iPhone samples into one keyboard transition", () => {
    const outputs = [616, 352].map((height) => keyboardInset(616, height));
    const transitions = outputs
      .slice(1)
      .filter((value, index) => value !== outputs[index]);

    expect(new Set(outputs).size).toBe(2);
    expect(transitions).toHaveLength(1);
  });
});
