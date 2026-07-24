"use client";

import { useMemo, useSyncExternalStore } from "react";

/**
 * Read a media query as state.
 *
 * `useSyncExternalStore` rather than an effect: this repo's ESLint forbids
 * `setState` inside an effect (`react-hooks/set-state-in-effect`), and the
 * subscription model is the right one anyway — the browser owns the value.
 *
 * `fallback` is what the prerendered HTML assumes; the client corrects it on
 * hydration.
 */
export function useMediaQuery(query: string, fallback = false): boolean {
  const [subscribe, getSnapshot] = useMemo(() => {
    const sub = (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    };
    const get = () =>
      typeof window === "undefined" ? fallback : window.matchMedia(query).matches;
    return [sub, get] as const;
  }, [query, fallback]);

  return useSyncExternalStore(subscribe, getSnapshot, () => fallback);
}

/** The `sm` breakpoint — where a bottom sheet becomes a side sheet. */
export const SM_UP = "(min-width: 40rem)";
