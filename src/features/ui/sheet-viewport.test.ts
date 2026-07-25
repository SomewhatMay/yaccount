import { describe, expect, it, vi } from "vitest";
import {
  bottomSheetViewportStyle,
  subscribeVisualViewport,
} from "@/features/ui/sheet-viewport";

describe("iOS bottom-sheet viewport handling", () => {
  it("anchors a bottom sheet above the keyboard with a visible top gap", () => {
    expect(
      bottomSheetViewportStyle({
        height: 500,
        offsetTop: 20,
        layoutHeight: 800,
      }),
    ).toEqual({
      bottom: "280px",
      maxHeight: "440px",
    });
  });

  it("uses CSS viewport fallback before visual viewport data is available", () => {
    expect(bottomSheetViewportStyle(null)).toBeUndefined();
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
});
