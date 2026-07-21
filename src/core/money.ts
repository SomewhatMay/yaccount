import type { Cents } from "./model/primitives";
export type { Cents };

/**
 * Assert a value is a valid integer-cents amount. Beyond `MAX_SAFE_INTEGER`,
 * `SUM` stops being exact — which is the whole reason money is integer cents
 * (§1) — so an unsafe magnitude is rejected rather than silently drifting.
 */
export function cents(n: number): Cents {
  if (!Number.isSafeInteger(n)) throw new Error(`cents must be a safe integer, got ${n}`);
  return n === 0 ? 0 : n; // normalize -0
}

export function addCents(a: Cents, b: Cents): Cents {
  return a + b;
}
export function subCents(a: Cents, b: Cents): Cents {
  return a - b;
}
export function negateCents(a: Cents): Cents {
  return a === 0 ? 0 : -a; // normalize -0 → 0
}
export function sumCents(xs: Cents[]): Cents {
  return xs.reduce((s, x) => s + x, 0);
}

/**
 * Parse a user-entered dollar string into integer cents (the input edge).
 * Accepts an optional leading '-', a '$', grouping commas, and whitespace.
 * Rounds half-up on the third decimal using integer/string math so there is no
 * floating-point drift. Throws on anything it cannot parse.
 */
export function parseDollars(input: string): Cents {
  // Anchored, not a global strip: "$" only at the front, commas only between
  // digit groups, no interior spaces. A loose `replace(/[$,\s]/g, "")` turned
  // "12.3 4" into $12.34 and "1$2" into $12 — a wrong amount on disk, which is
  // precisely the failure this module exists to prevent.
  const cleaned = input.trim();
  const m = /^(-)?\$?(\d{1,3}(?:,\d{3})*|\d+)?(?:\.(\d+))?$/.exec(cleaned);
  if (!m) throw new Error(`invalid money input: "${input}"`);
  const [, minus, intGrouped, fracRaw] = m;
  // Need a digit somewhere: "", "-", "$", "." are all invalid.
  if (!intGrouped && !fracRaw) throw new Error(`invalid money input: "${input}"`);
  const intRaw = (intGrouped ?? "").replace(/,/g, "");
  const wholeCents = Number(intRaw || "0") * 100;
  let fracCents = 0;
  if (fracRaw && fracRaw.length > 0) {
    fracCents = Number((fracRaw + "00").slice(0, 2));
    if (fracRaw.length >= 3 && Number(fracRaw[2]) >= 5) fracCents += 1; // round half-up
  }
  const magnitude = wholeCents + fracCents;
  if (magnitude === 0) return 0; // avoid -0
  return cents(minus ? -magnitude : magnitude); // safe-integer guard
}

/**
 * Format integer cents for display (the display edge). Negatives get an explicit
 * leading minus (spec §5.4 "Starbucks: −$10"), thousands are grouped.
 */
export function formatCents(c: Cents): string {
  const negative = c < 0;
  const body = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(c) / 100);
  return `${negative ? "-" : ""}$${body}`;
}
