const KEYBOARD_THRESHOLD = 60;

interface VerticalRect {
  top: number;
  bottom: number;
}

export function focusedScrollDelta(
  scrollport: VerticalRect,
  field: VerticalRect,
  padding: number,
): number {
  const visibleTop = scrollport.top + padding;
  const visibleBottom = scrollport.bottom - padding;
  if (field.bottom > visibleBottom) return Math.round(field.bottom - visibleBottom);
  if (field.top < visibleTop) return Math.round(field.top - visibleTop);
  return 0;
}

export function keyboardInset(base: number, height: number): number {
  const delta = Math.round(base - height);
  return delta > KEYBOARD_THRESHOLD ? delta : 0;
}

export function keyboardGeometry(
  base: number,
  height: number,
  viewportTop: number,
): { inset: number; lift: number } {
  const inset = keyboardInset(base, height);
  return {
    inset,
    lift: Math.max(0, Math.round(inset - viewportTop)),
  };
}

export function viewportTop(viewport: VisualViewport): number {
  return viewport.offsetTop;
}

export function nextBaseline(prev: number, height: number): number {
  return Math.max(prev, height);
}

export function sheetKeyboardStyle(
  inset: number,
  lift = inset,
): {
  translate: string;
  "--kb": string;
} {
  return {
    translate: `0 -${lift}px`,
    "--kb": `${inset}px`,
  };
}

export function sheetViewportStyle(
  inset: number,
  lift: number,
): ReturnType<typeof sheetKeyboardStyle> & { "--sheet-occlusion": string } {
  return {
    ...sheetKeyboardStyle(inset, lift),
    "--sheet-occlusion": `${lift}px`,
  };
}
