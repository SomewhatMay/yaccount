import { describe, it, expect } from "vitest";
import {
  CATEGORY_ICONS,
  categoryIcon,
  searchCategoryIcons,
} from "@/features/category-icons";

describe("categoryIcon", () => {
  it("resolves a known name to a component", () => {
    expect(categoryIcon("ShoppingCart")).toBeTypeOf("object");
  });

  it("returns undefined for a null name (falls back to the dot)", () => {
    expect(categoryIcon(null)).toBeUndefined();
  });

  it("returns undefined for an unknown name (a build without that icon)", () => {
    expect(categoryIcon("NotARealIconName")).toBeUndefined();
  });
});

describe("searchCategoryIcons", () => {
  it("returns the whole catalog for an empty query", () => {
    expect(searchCategoryIcons("")).toHaveLength(CATEGORY_ICONS.length);
    expect(searchCategoryIcons("   ")).toHaveLength(CATEGORY_ICONS.length);
  });

  it("matches on keywords, not only the icon name", () => {
    // "grocery" is nowhere in the name "ShoppingCart" — only in its keywords.
    const names = searchCategoryIcons("grocery").map((e) => e.name);
    expect(names).toContain("ShoppingCart");
  });

  it("finds an icon by a synonym a user would type", () => {
    expect(searchCategoryIcons("gym").map((e) => e.name)).toContain("Dumbbell");
    expect(searchCategoryIcons("petrol").map((e) => e.name)).toContain("Fuel");
  });

  it("requires every term to match (AND, not OR)", () => {
    const both = searchCategoryIcons("food fruit");
    expect(both.length).toBeGreaterThan(0);
    for (const e of both) {
      const hay = `${e.name} ${e.keywords}`.toLowerCase();
      expect(hay).toContain("food");
      expect(hay).toContain("fruit");
    }
  });

  it("returns nothing for a query that matches no icon", () => {
    expect(searchCategoryIcons("zzzznope")).toHaveLength(0);
  });

  it("is case-insensitive", () => {
    expect(searchCategoryIcons("COFFEE").map((e) => e.name)).toContain("Coffee");
  });
});
