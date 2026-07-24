import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { contrastRatio, parseOklch } from "@/features/ui/contrast";

/**
 * The design language lives in `globals.css`, so this is where it is proved.
 * Two things are checked and neither is cosmetic:
 *
 * 1. **The field is tinted.** "The Standing Register" rests on a neutral ramp
 *    carrying a trace of the brand hue; an untinted token is the app sliding
 *    back to default shadcn grey.
 * 2. **The ramp is legible.** Every pair a user actually reads has to clear
 *    WCAG AA in BOTH themes. A retheme that quietly drops contrast is a
 *    regression no screenshot catches.
 */
const CSS = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

/** Brand hue for the whole neutral ramp (§12.2). */
const BRAND_HUE = 285;
const HUE_TOLERANCE = 12;
const AA_TEXT = 4.5;
const AA_NON_TEXT = 3;

/** Collect the custom properties declared in every block matching `selector`. */
function tokensIn(selector: string): Map<string, string> {
  const out = new Map<string, string>();
  const blocks = CSS.matchAll(
    new RegExp(`${selector.replace(".", "\\.")}\\s*\\{([^}]*)\\}`, "g"),
  );
  for (const block of blocks) {
    for (const decl of block[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      out.set(decl[1], decl[2].trim()); // a later block wins, as the cascade does
    }
  }
  return out;
}

const LIGHT = tokensIn(":root");
const DARK = tokensIn(".dark");

/** Resolve `var(--x)` indirection so `--primary: var(--brand)` is testable. */
function token(theme: "light" | "dark", name: string): string {
  const map = theme === "dark" ? DARK : LIGHT;
  let value = map.get(name) ?? LIGHT.get(name);
  for (let hops = 0; value && hops < 5; hops++) {
    const ref = /^var\((--[\w-]+)\)$/.exec(value);
    if (!ref) break;
    value = map.get(ref[1]) ?? LIGHT.get(ref[1]);
  }
  if (!value) throw new Error(`${theme} theme is missing ${name}`);
  return value;
}

const THEMES = ["light", "dark"] as const;

describe("design tokens — the paper-and-ink ramp", () => {
  it.each(THEMES)("%s: defines both themes", (theme) => {
    expect(token(theme, "--background")).toMatch(/^oklch\(/);
  });

  // The neutral field is not neutral: it carries the brand hue.
  const TINTED = [
    "--background",
    "--foreground",
    "--card",
    "--muted",
    "--muted-foreground",
    "--border",
  ];
  for (const theme of THEMES) {
    it.each(TINTED)(`${theme}: %s is tinted with the brand hue`, (name) => {
      const color = parseOklch(token(theme, name));
      expect(color, `${name} should be an oklch color`).not.toBeNull();
      expect(color!.c, `${name} should carry a trace of chroma`).toBeGreaterThan(0);
      expect(Math.abs(color!.h - BRAND_HUE)).toBeLessThanOrEqual(HUE_TOLERANCE);
    });
  }

  it.each(THEMES)("%s: the brand is a full-strength iris, not a wash", (theme) => {
    const brand = parseOklch(token(theme, "--brand"))!;
    expect(brand.c).toBeGreaterThanOrEqual(0.15);
    expect(Math.abs(brand.h - BRAND_HUE)).toBeLessThanOrEqual(HUE_TOLERANCE);
  });

  it.each(THEMES)("%s: surfaces and the rule are defined", (theme) => {
    expect(parseOklch(token(theme, "--surface-sunken"))).not.toBeNull();
    expect(parseOklch(token(theme, "--rule"))).not.toBeNull();
  });

  it.each(THEMES)("%s: the rule reads harder than an ordinary border", (theme) => {
    // A rule means "this sums the above" — it has to be visible as a mark.
    const bg = token(theme, "--background");
    expect(contrastRatio(token(theme, "--rule"), bg)).toBeGreaterThan(
      contrastRatio(token(theme, "--border"), bg),
    );
  });
});

describe("design tokens — legibility (WCAG AA in both themes)", () => {
  // Text pairs a user reads at body size.
  const TEXT_PAIRS: [string, string][] = [
    ["--foreground", "--background"],
    ["--foreground", "--card"],
    ["--foreground", "--surface-sunken"],
    ["--muted-foreground", "--background"],
    ["--muted-foreground", "--card"],
    ["--muted-foreground", "--muted"],
    ["--muted-foreground", "--surface-sunken"],
    ["--positive", "--background"],
    ["--positive", "--card"],
    ["--destructive", "--background"],
    ["--destructive", "--card"],
    ["--primary", "--background"],
    ["--primary-foreground", "--primary"],
  ];

  for (const theme of THEMES) {
    it.each(TEXT_PAIRS)(`${theme}: %s on %s clears AA`, (fg, bg) => {
      const ratio = contrastRatio(token(theme, fg), token(theme, bg));
      expect(ratio, `${fg} on ${bg} was ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
        AA_TEXT,
      );
    });
  }

  it.each(THEMES)("%s: the focus ring is visible against the page", (theme) => {
    // WCAG 1.4.11: a focus indicator is non-text content and needs 3:1.
    expect(
      contrastRatio(token(theme, "--ring"), token(theme, "--background")),
    ).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });
});

describe("design language — the devices §12 names", () => {
  it.each([
    ".figure-hero",
    ".figure-lg",
    ".figure-md",
    ".marginalia",
    ".eyebrow",
    ".rule",
    ".leaders",
  ])("defines %s", (selector) => {
    expect(CSS).toContain(selector);
  });

  it("defines the motion budget as tokens", () => {
    for (const name of ["--ease-register", "--dur-1", "--dur-2", "--dur-3"]) {
      expect(LIGHT.has(name), `${name} should be declared`).toBe(true);
    }
  });

  it("kills motion globally when the reader asks for less", () => {
    expect(CSS).toContain("prefers-reduced-motion: reduce");
  });
});
