import { describe, expect, it, vi } from "vitest";
import {
  bottomSheetBleedStyle,
  bottomSheetViewportStyle,
  subscribeVisualViewport,
} from "@/features/ui/sheet-viewport";

describe("iOS bottom-sheet viewport handling", () => {
  it("anchors a bottom sheet above the keyboard with a visible top gap", () => {
    expect(
      bottomSheetViewportStyle({
        height: 500,
        offsetTop: 20,
        pageTop: 120,
        scrollY: 100,
      }),
    ).toEqual({
      bottom: "auto",
      maxHeight: "440px",
      top: "520px",
      translate: "0 -100%",
    });
  });

  it("uses page position when WebKit under-reports offsetTop", () => {
    expect(
      bottomSheetViewportStyle({
        height: 500,
        offsetTop: 0,
        pageTop: 180,
        scrollY: 100,
      }),
    ).toMatchObject({ top: "580px" });
  });

  it("extends only the sheet background below the visual viewport", () => {
    expect(
      bottomSheetBleedStyle({
        height: 500,
        offsetTop: 20,
        pageTop: 120,
        scrollY: 100,
      }),
    ).toEqual({
      height: "100lvh",
      top: "520px",
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
