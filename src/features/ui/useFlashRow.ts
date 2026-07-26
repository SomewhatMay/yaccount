"use client";

import { useEffect, useRef } from "react";
import { useAtomValue } from "jotai";
import { flashedRowAtom } from "@/features/store";

/**
 * "This is the row you were looking for."
 *
 * The register has marked and scrolled to a row since M11; search results now do
 * the same on four more screens, so the gesture lives here once. A row you just
 * logged flashes without scrolling (it is already at the top); a row arrived at
 * from ⌘K or a `?focus=` link scrolls itself into view.
 *
 * `scroll-behavior` is zeroed globally under `prefers-reduced-motion` (§12.5),
 * so the smooth scroll obeys that with no special case here.
 */
export function useFlashRow<T extends HTMLElement = HTMLDivElement>(id: string) {
  const flash = useAtomValue(flashedRowAtom);
  const flashed = flash?.id === id;
  const bringIntoView = flashed && flash.scroll;
  const ref = useRef<T>(null);

  useEffect(() => {
    if (bringIntoView) ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [bringIntoView]);

  return { ref, flashed };
}
