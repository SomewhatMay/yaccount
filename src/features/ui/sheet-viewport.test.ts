import { describe, expect, it } from "vitest";
import {
  keyboardGeometry,
  keyboardInset,
  nextBaseline,
  sheetKeyboardStyle,
  sheetViewportStyle,
} from "@/features/ui/sheet-viewport";

describe("iOS bottom-sheet keyboard inset", () => {
  it("separates keyboard height from the recorded Safari viewport pan", () => {
    expect(keyboardGeometry(616, 352, 196.66)).toEqual({
      inset: 264,
      lift: 67,
    });
  });

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

  it("recovers a baseline captured while the keyboard was already open", () => {
    const shrunken = nextBaseline(0, 352);
    expect(shrunken).toBe(352);
    expect(keyboardInset(shrunken, 352)).toBe(0);

    const recovered = nextBaseline(shrunken, 616);
    expect(recovered).toBe(616);
    expect(keyboardInset(recovered, 616)).toBe(0);
    expect(nextBaseline(recovered, 352)).toBe(616);
  });

  it("moves the sheet with a separate translate property", () => {
    const style = sheetKeyboardStyle(264);

    expect(style).toEqual({ translate: "0 -264px", "--kb": "264px" });
    expect(style).not.toHaveProperty("transform");
    expect(style).not.toHaveProperty("bottom");
  });

  it("extends the sheet surface through the recorded Safari obstruction", () => {
    expect(sheetViewportStyle(264, 67)).toEqual({
      translate: "0 -67px",
      "--kb": "264px",
      "--sheet-occlusion": "67px",
    });
  });
});
