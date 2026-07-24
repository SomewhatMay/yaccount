"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Device-local view preferences — how you like to look at your ledger, as
 * opposed to what is in it.
 *
 * These deliberately do NOT go through the op log. A sort order is not a fact
 * about your money; syncing it would mean a phone deciding how a laptop reads
 * (§8.4 ledgers carry the ledger, nothing else). localStorage, per device.
 *
 * Storage is a convenience, never a dependency: private browsing, a blocked
 * storage setting or a server prerender all leave it unreadable, and every one of
 * those must render the fallback rather than throw. Read through
 * `useSyncExternalStore` — the browser owns the value, and this repo's ESLint
 * forbids `setState` inside an effect (`react-hooks/set-state-in-effect`).
 */

/**
 * What a stored string is worth. A preference this build no longer recognises —
 * written by a newer version, or edited by hand — falls back rather than putting
 * the UI into a state it has no code for.
 */
export function pickPref<T extends string>(
  raw: string | null,
  fallback: T,
  isValid: (value: string) => value is T,
): T {
  return raw !== null && isValid(raw) ? raw : fallback;
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null; // storage disabled entirely — the app still works
  }
}

export function readPref<T extends string>(
  key: string,
  fallback: T,
  isValid: (value: string) => value is T,
): T {
  try {
    return pickPref(storage()?.getItem(key) ?? null, fallback, isValid);
  } catch {
    return fallback;
  }
}

/** Listeners are ours: a `storage` event fires in OTHER tabs, never the one that
 *  wrote, so a same-tab change needs its own notification. */
const listeners = new Set<() => void>();

export function writePref(key: string, value: string): void {
  try {
    storage()?.setItem(key, value);
  } catch {
    // Full or blocked: the preference just doesn't survive a reload.
  }
  for (const notify of listeners) notify();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * A validated preference as state. The server snapshot is the fallback, so the
 * prerendered HTML is coherent and the client corrects it on hydration.
 */
export function useLocalPref<T extends string>(
  key: string,
  fallback: T,
  isValid: (value: string) => value is T,
): [T, (value: T) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => readPref(key, fallback, isValid),
    () => fallback,
  );
  const set = useCallback((next: T) => writePref(key, next), [key]);
  return [value, set];
}
