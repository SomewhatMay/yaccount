import type { Cents } from "./model/primitives";
export type { Cents };

/** Assert a value is a valid integer-cents amount. */
export function cents(n: number): Cents {
  if (!Number.isInteger(n)) throw new Error(`cents must be an integer, got ${n}`);
  return n;
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
  const cleaned = input.trim().replace(/[$,\s]/g, "");
  const m = /^(-)?(\d*)(?:\.(\d+))?$/.exec(cleaned);
  if (!m) throw new Error(`invalid money input: "${input}"`);
  const [, minus, intRaw, fracRaw] = m;
  // require at least one digit somewhere ("", "-", "." etc. are invalid)
  if (
    (intRaw === "" || intRaw === undefined) &&
    (fracRaw === "" || fracRaw === undefined)
  ) {
    throw new Error(`invalid money input: "${input}"`);
  }
  const wholeCents = Number(intRaw || "0") * 100;
  let fracCents = 0;
  if (fracRaw && fracRaw.length > 0) {
    fracCents = Number((fracRaw + "00").slice(0, 2));
    if (fracRaw.length >= 3 && Number(fracRaw[2]) >= 5) fracCents += 1; // round half-up
  }
  const magnitude = wholeCents + fracCents;
  if (magnitude === 0) return 0; // avoid -0
  return minus ? -magnitude : magnitude;
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
