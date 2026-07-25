import { describe, expect, it, vi } from "vitest";
import {
  bottomSheetMaxHeight,
  revealFocusedControl,
  subscribeVisualViewport,
} from "@/features/ui/sheet-viewport";

describe("iOS bottom-sheet viewport handling", () => {
  it("limits a bottom sheet to 88% of the visual viewport", () => {
    expect(bottomSheetMaxHeight(500)).toBe("440px");
    expect(bottomSheetMaxHeight(null)).toBeUndefined();
  });

  it("subscribes to viewport resize and scroll, then removes both listeners", () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const viewport = { addEventListener, removeEventListener };
    const onChange = vi.fn();

    const cleanup = subscribeVisualViewport(viewport, onChange);

    expect(addEventListener).toHaveBeenCalledWith("resize", onChange);
    expect(addEventListener).toHaveBeenCalledWith("scroll", onChange);
    cleanup();
    expect(removeEventListener).toHaveBeenCalledWith("resize", onChange);
    expect(removeEventListener).toHaveBeenCalledWith("scroll", onChange);
  });

  it("reveals only a focused control contained by the bottom sheet", () => {
    const scrollIntoView = vi.fn();
    const focused = { scrollIntoView };
    const sheet = { contains: vi.fn(() => true) };

    expect(revealFocusedControl(sheet, focused)).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
      inline: "nearest",
      behavior: "instant",
    });

    sheet.contains.mockReturnValue(false);
    expect(revealFocusedControl(sheet, focused)).toBe(false);
    expect(revealFocusedControl(sheet, null)).toBe(false);
  });
});
