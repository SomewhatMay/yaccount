export interface VisualViewportEvents {
  addEventListener(type: "resize" | "scroll", listener: () => void): void;
  removeEventListener(type: "resize" | "scroll", listener: () => void): void;
}

export interface BottomSheetViewport {
  height: number;
  offsetTop: number;
  pageTop: number;
  scrollY: number;
}

export function bottomSheetViewportStyle(
  viewport: BottomSheetViewport | null,
): { bottom: "auto"; maxHeight: string; top: string; translate: "0 -100%" } | undefined {
  if (!viewport) return undefined;
  const topOffset = Math.max(0, viewport.offsetTop, viewport.pageTop - viewport.scrollY);
  return {
    bottom: "auto",
    maxHeight: `${viewport.height * 0.88}px`,
    top: `${topOffset + viewport.height}px`,
    translate: "0 -100%",
  };
}

export function subscribeVisualViewport(
  viewport: VisualViewportEvents | null,
  onChange: () => void,
): () => void {
  if (!viewport) return () => undefined;
  viewport.addEventListener("resize", onChange);
  viewport.addEventListener("scroll", onChange);
  return () => {
    viewport.removeEventListener("resize", onChange);
    viewport.removeEventListener("scroll", onChange);
  };
}
