export interface VisualViewportEvents {
  addEventListener(type: "resize" | "scroll", listener: () => void): void;
  removeEventListener(type: "resize" | "scroll", listener: () => void): void;
}

interface SheetRegion {
  contains(node: unknown): boolean;
}

interface FocusedControl {
  scrollIntoView(options: ScrollIntoViewOptions): void;
}

export function bottomSheetMaxHeight(height: number | null): string | undefined {
  return height === null ? undefined : `${height * 0.88}px`;
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

export function revealFocusedControl(
  sheet: SheetRegion,
  focused: FocusedControl | null,
): boolean {
  if (!focused || !sheet.contains(focused)) return false;
  focused.scrollIntoView({
    block: "nearest",
    inline: "nearest",
    behavior: "instant",
  });
  return true;
}
