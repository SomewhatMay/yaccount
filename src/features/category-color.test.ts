import { describe, it, expect } from "vitest";
import {
  categoryColor,
  categoryColorFor,
  categoryDotColor,
} from "@/features/category-color";

describe("categoryDotColor", () => {
  it("is deterministic per id", () => {
    expect(categoryDotColor("abc")).toBe(categoryDotColor("abc"));
  });

  it("spreads different ids to different hues", () => {
    expect(categoryDotColor("abc")).not.toBe(categoryDotColor("abd"));
  });
});

describe("categoryColor", () => {
  it("prefers a stored override", () => {
    const color = "oklch(0.65 0.16 25)";
    expect(categoryColor({ id: "abc", color })).toBe(color);
  });

  it("falls back to the deterministic hue when no override is set", () => {
    expect(categoryColor({ id: "abc", color: null })).toBe(categoryDotColor("abc"));
  });

  it("treats an empty-string override as no override (deterministic)", () => {
    // A stored colour is either a real value or null; an empty string is not a
    // colour, so it must not paint the dot transparent.
    expect(categoryColor({ id: "abc", color: "" })).toBe(categoryDotColor("abc"));
  });
});

describe("categoryColorFor", () => {
  const categories = [
    { id: "a", color: "oklch(0.66 0.14 160)" },
    { id: "b", color: null },
  ];

  it("resolves the override for a known id", () => {
    expect(categoryColorFor("a", categories)).toBe("oklch(0.66 0.14 160)");
  });

  it("falls back to the deterministic hue for a known id with no override", () => {
    expect(categoryColorFor("b", categories)).toBe(categoryDotColor("b"));
  });

  it("falls back to the deterministic hue for an unknown id — same scheme, never a second one", () => {
    expect(categoryColorFor("zzz", categories)).toBe(categoryDotColor("zzz"));
  });

  it("falls back to the deterministic hue for an empty id", () => {
    expect(categoryColorFor("", categories)).toBe(categoryDotColor(""));
  });
});
