import { describe, it, expect } from "vitest";
import {
  DISTRIBUTION_DEFAULT_KEY,
  distributionKey,
  isDistributionKey,
  makeDistributionPreset,
  parseDistributionPreset,
  serializeDistributionPreset,
  restBps,
  type DistributionPreset,
} from "@/core/model";

const preset = (over: Partial<DistributionPreset> = {}): DistributionPreset =>
  makeDistributionPreset({
    id: "p1",
    name: "Paycheck",
    rest_container_id: "general",
    parts: [
      { container_id: "savings", bps: 2000 },
      { container_id: "invest", bps: 3300 },
    ],
    ...over,
  });

describe("distribution preset (plans/income-distribution.md)", () => {
  it("builds an active preset and derives the rest share", () => {
    const p = preset();
    expect(p.v).toBe(1);
    expect(p.archived).toBe(false);
    expect(restBps(p)).toBe(4700);
  });

  it("allows parts summing to exactly 100% — rest then takes only rounding cents", () => {
    const p = preset({
      parts: [
        { container_id: "savings", bps: 5000 },
        { container_id: "invest", bps: 5000 },
      ],
    });
    expect(restBps(p)).toBe(0);
  });

  it("refuses parts over 100%", () => {
    expect(() =>
      preset({
        parts: [
          { container_id: "savings", bps: 6000 },
          { container_id: "invest", bps: 5000 },
        ],
      }),
    ).toThrow();
  });

  it("refuses a part at the rest container, a duplicate part, and a zero or fractional share", () => {
    expect(() => preset({ parts: [{ container_id: "general", bps: 100 }] })).toThrow();
    expect(() =>
      preset({
        parts: [
          { container_id: "savings", bps: 100 },
          { container_id: "savings", bps: 200 },
        ],
      }),
    ).toThrow();
    expect(() => preset({ parts: [{ container_id: "savings", bps: 0 }] })).toThrow();
    expect(() => preset({ parts: [{ container_id: "savings", bps: 12.5 }] })).toThrow();
  });

  it("trims the name and refuses a blank one", () => {
    expect(preset({ name: "  Paycheck  " }).name).toBe("Paycheck");
    expect(() => preset({ name: "   " })).toThrow();
  });

  it("allows a preset with no parts (everything to rest)", () => {
    expect(restBps(preset({ parts: [] }))).toBe(10000);
  });

  it("round-trips through its setting value", () => {
    const p = preset();
    expect(parseDistributionPreset(serializeDistributionPreset(p))).toEqual(p);
  });

  it("parses tolerantly — a malformed value is ignored, never thrown on", () => {
    expect(parseDistributionPreset("not json")).toBeNull();
    expect(parseDistributionPreset("{}")).toBeNull();
    expect(
      parseDistributionPreset(JSON.stringify({ ...preset(), parts: "x" })),
    ).toBeNull();
  });

  it("namespaces presets in settings, one key each", () => {
    expect(distributionKey("p1")).toBe("distribution:p1");
    expect(isDistributionKey("distribution:p1")).toBe(true);
    expect(isDistributionKey(DISTRIBUTION_DEFAULT_KEY)).toBe(false);
    expect(isDistributionKey("default_container_id")).toBe(false);
  });
});
