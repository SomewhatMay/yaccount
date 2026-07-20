import { describe, it, expect } from "vitest";

// M0 smoke test: proves the Vitest toolchain runs against src/core.
// Real domain tests arrive in M1.
describe("M0 scaffold", () => {
  it("runs the test toolchain", () => {
    expect(1 + 1).toBe(2);
  });
});
