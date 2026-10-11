import type { MouseEvent } from "react";

const INTERACTIVE_TARGETS =
  'button, a, input, select, textarea, [role="menuitem"], [contenteditable="true"]';

/** Ignore controls inside a clickable card so their own actions keep working. */
export function activateCardOnClick(
  event: MouseEvent<HTMLElement>,
  onActivate: () => void,
): void {
  const target = event.target as { closest?: (selector: string) => unknown } | null;
  if (target?.closest?.(INTERACTIVE_TARGETS)) return;
  onActivate();
}
