export interface VisualViewportEvents {
  addEventListener(type: "resize" | "scroll", listener: () => void): void;
  removeEventListener(type: "resize" | "scroll", listener: () => void): void;
}

export interface BottomSheetViewport {
  height: number;
  offsetTop: number;
  layoutHeight: number;
}

const KEYBOARD_THRESHOLD = 60;

export function keyboardInset(base: number, height: number): number {
  const delta = Math.round(base - height);
  return delta > KEYBOARD_THRESHOLD ? delta : 0;
}

export function bottomSheetViewportStyle(viewport: BottomSheetViewport | null):
  | {
      bottom: string;
      maxHeight: string;
    }
  | undefined {
  if (!viewport) return undefined;
  return {
    bottom: `${Math.max(
      0,
      viewport.layoutHeight - viewport.offsetTop - viewport.height,
    )}px`,
    maxHeight: `${viewport.height * 0.88}px`,
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
