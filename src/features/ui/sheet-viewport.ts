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

const IOS_CHROME_OVERLAP = 96;

function visualViewportTop(viewport: BottomSheetViewport): number {
  return Math.max(0, viewport.offsetTop, viewport.pageTop - viewport.scrollY);
}

export function bottomSheetViewportStyle(viewport: BottomSheetViewport | null):
  | {
      bottom: "auto";
      maxHeight: string;
      paddingBottom: string;
      scrollPaddingBottom: string;
      top: string;
      translate: "0 -100%";
    }
  | undefined {
  if (!viewport) return undefined;
  const bottomEdge = visualViewportTop(viewport) + viewport.height + IOS_CHROME_OVERLAP;
  return {
    bottom: "auto",
    maxHeight: `${viewport.height * 0.88 + IOS_CHROME_OVERLAP}px`,
    paddingBottom: `${IOS_CHROME_OVERLAP}px`,
    scrollPaddingBottom: `${IOS_CHROME_OVERLAP}px`,
    top: `${bottomEdge}px`,
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
