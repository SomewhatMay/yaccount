import { describe, it, expect } from "vitest";
import { NO_FILTER, boundCents, toFilter } from "@/features/filter-draft";
import { activeFilterCount, isFilterActive } from "@/core/engine/filter";

describe("boundCents — a typed bound, or no bound at all", () => {
  it("reads a magnitude in cents", () => {
    expect(boundCents("10")).toBe(1000);
    expect(boundCents("1,250.75")).toBe(125075);
    expect(boundCents("$4.50")).toBe(450);
  });

  it("takes the SIZE, so a typed minus doesn't invert the bound", () => {
    // The rail asks "how big", not "which direction" — the engine's amount
    // bounds are on |amount| (§ filter.ts).
    expect(boundCents("-10")).toBe(1000);
  });

  it("is no constraint while the value is still being typed", () => {
    // `parseDollars` throws on a partial value. Mid-keystroke that is not an
    // error, it is just not a bound yet — the list must not empty under the
    // user's fingers.
    expect(boundCents("")).toBeNull();
    expect(boundCents("   ")).toBeNull();
    expect(boundCents("1.")).toBeNull();
    expect(boundCents("$")).toBeNull();
    expect(boundCents("abc")).toBeNull();
  });
});

describe("toFilter — what the rail has typed, as the engine's predicate", () => {
  it("an untouched draft constrains nothing", () => {
    const f = toFilter(NO_FILTER);
    expect(activeFilterCount(f)).toBe(0);
    expect(isFilterActive(f)).toBe(false);
  });

  it("carries every facet through", () => {
    const f = toFilter({
      ...NO_FILTER,
      text: "blue",
      categoryIds: ["coffee"],
      containerIds: ["wallet"],
      kinds: ["expense"],
      ruleIds: ["rent-rule"],
      dates: { from: "2026-07-01", to: "2026-07-31" },
      amounts: { from: "5", to: "100" },
    });
    expect(f.text).toBe("blue");
    expect(f.categoryIds).toEqual(["coffee"]);
    expect(f.containerIds).toEqual(["wallet"]);
    expect(f.kinds).toEqual(["expense"]);
    expect(f.ruleIds).toEqual(["rent-rule"]);
    expect(f.range).toEqual({ start: "2026-07-01", end: "2026-07-31" });
    expect(f.minAmount).toBe(500);
    expect(f.maxAmount).toBe(10000);
    expect(activeFilterCount(f)).toBe(7);
  });

  it("an empty date side stays open rather than becoming a bound", () => {
    const f = toFilter({ ...NO_FILTER, dates: { from: "2026-07-01", to: "" } });
    expect(f.range).toEqual({ start: "2026-07-01", end: null });
    expect(activeFilterCount(f)).toBe(1);
  });

  it("a half-typed amount is not yet an active filter", () => {
    const f = toFilter({ ...NO_FILTER, amounts: { from: "1.", to: "" } });
    expect(f.minAmount).toBeNull();
    expect(isFilterActive(f)).toBe(false);
  });
});
