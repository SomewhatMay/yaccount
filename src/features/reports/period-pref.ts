"use client";

import { useCallback, useMemo } from "react";
import { isPeriodPreset, type ReportingPeriod } from "@/core/engine/period";
import { isCalendarDate } from "@/core/model/primitives";
import { useLocalPref } from "@/features/prefs";

/**
 * Reporting periods are browser-local display state (§6.1). They persist through
 * `prefs.ts` and never enter the synced op log.
 *
 * `useLocalPref` stores strings, so a period is encoded as one — `p:<preset>` or
 * `c:<start>:<end>`. Decoding is strict on purpose: an unknown preset or a
 * half-written custom window falls back to the default rather than putting the
 * dashboard into a state it has no code to resolve.
 */

/** Compare-off is a stored VALUE, not an absent key — otherwise turning compare
 *  off would be indistinguishable from never having touched it, and the next
 *  visit would helpfully turn it back on. */
export const COMPARE_OFF = "off";

export function encodePeriod(period: ReportingPeriod): string {
  return period.kind === "preset"
    ? `p:${period.preset}`
    : `c:${period.start}:${period.end}`;
}

export function decodePeriod(raw: string): ReportingPeriod | null {
  const [tag, ...rest] = raw.split(":");
  if (tag === "p") {
    const preset = rest.join(":");
    return isPeriodPreset(preset) ? { kind: "preset", preset } : null;
  }
  if (tag === "c") {
    const [start, end] = rest;
    if (rest.length !== 2 || !isCalendarDate(start) || !isCalendarDate(end)) return null;
    // A window that runs backwards resolves to nothing at all (`inRange` is
    // inclusive on both sides), so it would render an empty dashboard with no
    // explanation. Treat it as unreadable and fall back.
    return start <= end ? { kind: "custom", start, end } : null;
  }
  return null;
}

export function encodeComparePref(period: ReportingPeriod | null): string {
  return period === null ? COMPARE_OFF : encodePeriod(period);
}

export function decodeComparePref(raw: string): ReportingPeriod | null {
  return raw === COMPARE_OFF ? null : decodePeriod(raw);
}

/** What a stored period preference may say. `useLocalPref` validates on read, so
 *  a value from a newer build never reaches the resolver. */
export function isPeriodPref(raw: string): raw is string {
  return raw === COMPARE_OFF || decodePeriod(raw) !== null;
}

/** The dashboard's own window, remembered. */
export function usePeriodPref(
  key: string,
  fallback: ReportingPeriod,
): [ReportingPeriod, (next: ReportingPeriod) => void] {
  const [raw, setRaw] = useLocalPref(key, encodePeriod(fallback), isPeriodPref);
  const period = useMemo(() => decodePeriod(raw) ?? fallback, [raw, fallback]);
  const set = useCallback(
    (next: ReportingPeriod) => setRaw(encodePeriod(next)),
    [setRaw],
  );
  return [period, set];
}

/** The optional second window of a two-range compare (§6.2); null = compare off. */
export function useComparePref(
  key: string,
): [ReportingPeriod | null, (next: ReportingPeriod | null) => void] {
  const [raw, setRaw] = useLocalPref(key, COMPARE_OFF, isPeriodPref);
  const period = useMemo(() => decodeComparePref(raw), [raw]);
  const set = useCallback(
    (next: ReportingPeriod | null) => setRaw(encodeComparePref(next)),
    [setRaw],
  );
  return [period, set];
}
