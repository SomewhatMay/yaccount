import { BPS_WHOLE } from "@/core/model";

/**
 * Percent at the edges of income distribution. Shares are stored as integer
 * basis points (1% = 100 bps) so the split stays integer math; these turn them
 * into what the user typed and back.
 */

/** 2000 → "20%", 1250 → "12.5%", 3333 → "33.33%". */
export function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(2).replace(/\.?0+$/, "")}%`;
}

const PERCENT_RE = /^(\d+)?(?:\.(\d{1,2}))?$/;

/** "12.5" → 1250 bps. At most two decimals, above 0, at most 100. */
export function parsePercent(
  raw: string,
): { ok: true; bps: number } | { ok: false; error: string } {
  const text = raw.trim().replace(/%$/, "").trim();
  const m = PERCENT_RE.exec(text);
  if (!text || !m || (m[1] === undefined && m[2] === undefined)) {
    return { ok: false, error: "Enter a percent, like 20 or 12.5." };
  }
  const whole = Number(m[1] ?? "0");
  const frac = Number((m[2] ?? "").padEnd(2, "0"));
  const bps = whole * 100 + frac;
  if (bps <= 0) return { ok: false, error: "A share needs to be more than 0%." };
  if (bps > BPS_WHOLE) return { ok: false, error: "A share can't be more than 100%." };
  return { ok: true, bps };
}

/** A fraction read back from real cents (0.2 → "20%", 1/3 → "33.3%"). */
export function formatShare(fraction: number): string {
  const tenths = Math.round(fraction * 1000) / 10;
  const text = Number.isInteger(tenths)
    ? String(Math.abs(tenths))
    : Math.abs(tenths).toFixed(1);
  return `${tenths < 0 ? "−" : ""}${text}%`;
}
