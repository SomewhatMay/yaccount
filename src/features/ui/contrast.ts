/**
 * oklch → sRGB → WCAG contrast, in about forty lines and with no dependency.
 *
 * The palette is authored in oklch because that is where "same lightness,
 * different hue" is actually true. The accessibility standard is defined in
 * sRGB, so proving the ramp is legible means converting between them. This is
 * the seam that lets `theme.test.ts` hold the design language to AA.
 */

export interface Oklch {
  l: number;
  c: number;
  h: number;
  alpha: number;
}

const OKLCH = /^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/;

function num(raw: string): number {
  return raw.endsWith("%") ? Number(raw.slice(0, -1)) / 100 : Number(raw);
}

/** Read an `oklch(…)` string. Anything else — a `var()`, a hex — returns null. */
export function parseOklch(input: string): Oklch | null {
  const m = OKLCH.exec(input.trim());
  if (!m) return null;
  return {
    l: num(m[1]),
    c: Number(m[2]),
    h: Number(m[3]),
    alpha: m[4] === undefined ? 1 : num(m[4]),
  };
}

function toColor(input: string | Oklch): Oklch {
  if (typeof input !== "string") return input;
  const parsed = parseOklch(input);
  if (!parsed) throw new Error(`Not an oklch color: ${input}`);
  return parsed;
}

const clamp = (x: number): number => Math.min(1, Math.max(0, x));
const encode = (c: number): number =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
const decode = (c: number): number =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

/** Linear-light sRGB, clamped into gamut the way a display would clamp it. */
function toLinearSrgb(color: Oklch): [number, number, number] {
  const rad = (color.h * Math.PI) / 180;
  const a = color.c * Math.cos(rad);
  const b = color.c * Math.sin(rad);

  const l = (color.l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (color.l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (color.l - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((channel) => decode(clamp(encode(channel)))) as [number, number, number];
}

/** WCAG relative luminance. White is 1, black is 0. */
export function relativeLuminance(color: string | Oklch): number {
  const [r, g, b] = toLinearSrgb(toColor(color));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * WCAG 2.x contrast ratio, 1:1 … 21:1. Both colors must be opaque — a
 * translucent token has no ratio until you know what is behind it, and
 * pretending otherwise would report a pass that isn't one.
 */
export function contrastRatio(a: string | Oklch, b: string | Oklch): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
