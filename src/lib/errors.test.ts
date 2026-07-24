import { describe, it, expect } from "vitest";
import { describeError, errorDetail, isHandled, markHandled } from "./errors";

describe("describeError — every failure must say something legible", () => {
  it("uses an Error's message", () => {
    expect(describeError(new Error("Quota exceeded"))).toBe("Quota exceeded");
  });

  it("falls back to the name when an Error has no message", () => {
    const e = new Error("");
    e.name = "QuotaExceededError";
    expect(describeError(e)).toBe("QuotaExceededError");
  });

  it("reads a DriveError's status and body structurally, without importing drivestore", () => {
    // `src/lib` must not depend on the sync seam, but a Drive failure is the most
    // likely thing a user will ever paste at us — so it has to read well here too.
    const driveish = {
      name: "DriveError",
      message: "Forbidden",
      status: 403,
      body: "insufficientPermissions",
    };
    const out = describeError(driveish);
    expect(out).toContain("403");
    expect(out).toContain("insufficientPermissions");
  });

  it("handles a thrown string and a thrown nothing", () => {
    expect(describeError("plain failure")).toBe("plain failure");
    expect(describeError(null)).toMatch(/unknown/i);
    expect(describeError(undefined)).toMatch(/unknown/i);
  });

  it("never returns an empty string, whatever it is handed", () => {
    for (const v of [{}, [], 0, false, NaN, Symbol("x")]) {
      expect(describeError(v).length).toBeGreaterThan(0);
    }
  });

  it("truncates a runaway body instead of flooding a toast", () => {
    const huge = { message: "boom", status: 500, body: "x".repeat(5000) };
    expect(describeError(huge).length).toBeLessThan(400);
  });
});

describe("errorDetail — the part that goes in the log, not the toast", () => {
  it("carries the stack", () => {
    const detail = errorDetail(new Error("boom"));
    expect(detail).toContain("boom");
    expect(detail).toMatch(/at |Error/);
  });

  it("follows a cause chain", () => {
    const inner = new Error("write failed");
    const outer = new Error("could not save", { cause: inner });
    expect(errorDetail(outer)).toContain("write failed");
  });

  it("serializes a non-Error without throwing", () => {
    expect(errorDetail({ status: 403 })).toContain("403");
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => errorDetail(circular)).not.toThrow();
  });
});

describe("markHandled — an error already shown to the user must not be shown twice", () => {
  it("marks and detects", () => {
    const e = new Error("boom");
    expect(isHandled(e)).toBe(false);
    expect(markHandled(e)).toBe(e); // same reference, so `throw markHandled(e)` reads right
    expect(isHandled(e)).toBe(true);
  });

  it("is invisible to normal use — the message and stack are untouched", () => {
    const e = markHandled(new Error("boom"));
    expect(e.message).toBe("boom");
    expect(Object.keys(e)).not.toContain("handled");
    expect(JSON.stringify({ e })).toBe(JSON.stringify({ e: {} }));
  });

  it("shrugs at values it cannot mark", () => {
    expect(() => markHandled("a string")).not.toThrow();
    expect(() => markHandled(null)).not.toThrow();
    expect(isHandled("a string")).toBe(false);
    expect(isHandled(null)).toBe(false);
  });
});
