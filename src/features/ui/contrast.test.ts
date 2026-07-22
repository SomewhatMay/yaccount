import { describe, it, expect } from "vitest";
import { parseOklch, relativeLuminance, contrastRatio } from "@/features/ui/contrast";

/**
 * The design language is written in oklch. To prove the ramp is legible we have
 * to be able to compute WCAG contrast from those tokens — that is all this is:
 * oklch → sRGB → relative luminance → ratio, with no color library.
 */
describe("parseOklch", () => {
  it("reads lightness, chroma and hue", () => {
    expect(parseOklch("oklch(0.54 0.2 280)")).toEqual({
      l: 0.54,
      c: 0.2,
      h: 280,
      alpha: 1,
    });
  });

  it("reads a percentage alpha", () => {
    expect(parseOklch("oklch(1 0 0 / 10%)")).toEqual({ l: 1, c: 0, h: 0, alpha: 0.1 });
  });

  it("reads a decimal alpha", () => {
    expect(parseOklch("oklch(0.2 0.01 285 / 0.5)")?.alpha).toBe(0.5);
  });

  it("tolerates surrounding whitespace", () => {
    expect(parseOklch("  oklch(0.9 0.006 285)  ")?.l).toBe(0.9);
  });

  it("returns null for anything that is not an oklch color", () => {
    expect(parseOklch("var(--brand)")).toBeNull();
    expect(parseOklch("#ffffff")).toBeNull();
  });
});

describe("relativeLuminance", () => {
  // An achromatic oklch lightness L is linear-light L³, so these are exact.
  it("puts white at 1 and black at 0", () => {
    expect(relativeLuminance("oklch(1 0 0)")).toBeCloseTo(1, 5);
    expect(relativeLuminance("oklch(0 0 0)")).toBeCloseTo(0, 5);
  });

  it("computes mid grey as L³", () => {
    expect(relativeLuminance("oklch(0.5 0 0)")).toBeCloseTo(0.125, 4);
  });

  it("clamps a color that falls outside the sRGB gamut", () => {
    const lum = relativeLuminance("oklch(0.6 0.4 300)");
    expect(lum).toBeGreaterThanOrEqual(0);
    expect(lum).toBeLessThanOrEqual(1);
  });
});

describe("contrastRatio", () => {
  it("gives 21:1 for black on white", () => {
    expect(contrastRatio("oklch(0 0 0)", "oklch(1 0 0)")).toBeCloseTo(21, 4);
  });

  it("is symmetric", () => {
    const a = "oklch(0.18 0.015 285)";
    const b = "oklch(0.988 0.003 285)";
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 10);
  });

  it("gives 1:1 for a color against itself", () => {
    expect(contrastRatio("oklch(0.5 0.1 285)", "oklch(0.5 0.1 285)")).toBeCloseTo(1, 10);
  });

  it("matches the known ratio of mid grey on white", () => {
    // (1 + 0.05) / (0.125 + 0.05) = 6
    expect(contrastRatio("oklch(0.5 0 0)", "oklch(1 0 0)")).toBeCloseTo(6, 4);
  });

  it("throws on a value it cannot read, rather than reporting a false pass", () => {
    expect(() => contrastRatio("var(--brand)", "oklch(1 0 0)")).toThrow();
  });
});
