export interface BottomSheetViewport {
  height: number;
  layoutHeight: number;
}

const KEYBOARD_THRESHOLD = 60;

export function keyboardInset(base: number, height: number): number {
  const delta = Math.round(base - height);
  return delta > KEYBOARD_THRESHOLD ? delta : 0;
}

export function nextBaseline(prev: number, height: number): number {
  return Math.max(prev, height);
}

export function bottomSheetViewportStyle(viewport: BottomSheetViewport | null):
  | {
      bottom: string;
      maxHeight: string;
    }
  | undefined {
  if (!viewport) return undefined;
  return {
    bottom: `${keyboardInset(viewport.layoutHeight, viewport.height)}px`,
    maxHeight: `${viewport.height * 0.88}px`,
  };
}
