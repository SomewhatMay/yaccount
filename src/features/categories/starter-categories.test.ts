import { describe, expect, it } from "vitest";
import { buildStarterCategoryOps, STARTER_CATEGORIES } from "./starter-categories";
import { makeCategory } from "@/core/model";
import { buildExport, serializeExport, validateExport } from "@/core/data";
import { readFileSync } from "node:fs";

describe("Everyday starter categories", () => {
  it("defines the compact default set, grouped by type, with stable keys and icons", () => {
    expect(
      STARTER_CATEGORIES.filter((item) => item.type === "expense").map((x) => x.name),
    ).toEqual([
      "Housing",
      "Groceries",
      "Dining",
      "Transport",
      "Utilities",
      "Health",
      "Shopping",
      "Entertainment",
      "Subscriptions",
      "Giving",
      "Travel",
      "Other",
    ]);
    expect(
      STARTER_CATEGORIES.filter((item) => item.type === "income").map((x) => x.name),
    ).toEqual(["Paycheck", "Other income"]);
    expect(new Set(STARTER_CATEGORIES.map((x) => x.key)).size).toBe(14);
    expect(STARTER_CATEGORIES.every((x) => x.icon.length > 0)).toBe(true);
    expect(Object.isFrozen(STARTER_CATEGORIES)).toBe(true);
    expect(STARTER_CATEGORIES.every(Object.isFrozen)).toBe(true);
  });

  it("creates selected items as ordinary category.create ops", () => {
    const ops = buildStarterCategoryOps(
      new Set(["groceries", "paycheck"]),
      [],
      () => "row-id",
      () => ({ id: "op-id", ts: "2026-07-25T12:00:00.000Z" }),
    );

    expect(ops.map((op) => op.type)).toEqual(["category.create", "category.create"]);
    expect(ops.map((op) => op.payload.row)).toEqual([
      expect.objectContaining({
        name: "Groceries",
        type: "expense",
        icon: expect.any(String),
        is_archived: false,
      }),
      expect.objectContaining({
        name: "Paycheck",
        type: "income",
        icon: expect.any(String),
        is_archived: false,
      }),
    ]);
  });

  it("rejects zero selection and names already present, case-insensitively", () => {
    expect(() => buildStarterCategoryOps(new Set(), [])).toThrow("Select a category");
    expect(() =>
      buildStarterCategoryOps(new Set(["groceries"]), [
        makeCategory({ name: " groceries ", type: "expense" }),
      ]),
    ).toThrow("Groceries");
  });

  it("rejects unknown keys deterministically", () => {
    expect(() => buildStarterCategoryOps(new Set(["missing"]), [])).toThrow("missing");
  });

  it("round-trips through the unchanged export/import format", async () => {
    const ops = buildStarterCategoryOps(
      new Set(["housing", "other-income"]),
      [],
      (() => {
        let id = 0;
        return () => `starter-row-${++id}`;
      })(),
      (() => {
        let id = 0;
        return () => ({
          id: `starter-op-${++id}`,
          ts: `2026-07-25T12:00:0${id}.000Z`,
        });
      })(),
    );
    const text = serializeExport(
      buildExport({
        ops,
        exportedAt: "2026-07-25T12:01:00.000Z",
        deviceId: "device",
      }),
    );

    const result = await validateExport(text);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.ops).toEqual(ops);
  });
});

describe("starter category onboarding UI contract", () => {
  const view = readFileSync(new URL("./CategoriesView.tsx", import.meta.url), "utf8");
  const sheet = readFileSync(
    new URL("./StarterCategoriesSheet.tsx", import.meta.url),
    "utf8",
  );

  it("offers starter and custom paths only inside the empty state", () => {
    const empty = view.indexOf("categories.length === 0");
    const starter = view.indexOf("Use a starter set");
    const custom = view.indexOf("Create one myself");
    const populated = view.indexOf("expenses.length === 0", empty);
    expect(starter).toBeGreaterThan(empty);
    expect(custom).toBeGreaterThan(starter);
    expect(starter).toBeLessThan(populated);
  });

  it("has labelled toggles, bulk controls, zero guard, and explicit commit copy", () => {
    expect(sheet).toContain("aria-label={`Add ${item.name}`}");
    expect(sheet).toContain("Select all");
    expect(sheet).toContain("Clear");
    expect(sheet).toContain("disabled={selected.size === 0 || saving}");
    expect(sheet).toContain("`Add ${selected.size} categories`");
    expect(sheet).toContain("Choose what fits. Rename or archive these anytime.");
  });
});
