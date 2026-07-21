import { describe, it, expect } from "vitest";
import { nameTaken } from "./unique-name";

const items = [
  { id: "a", name: "Vacation" },
  { id: "b", name: "General" },
];

describe("nameTaken — names are unique (§5.1, §5.2)", () => {
  it("catches a duplicate, ignoring case and surrounding space", () => {
    expect(nameTaken(items, "vacation")).toBe(true);
    expect(nameTaken(items, "  Vacation ")).toBe(true);
  });

  it("allows a free name", () => {
    expect(nameTaken(items, "Roof fund")).toBe(false);
  });

  it("does not count the row being renamed against itself", () => {
    expect(nameTaken(items, "Vacation", "a")).toBe(false);
    expect(nameTaken(items, "Vacation", "b")).toBe(true);
  });
});

describe("nameTaken — edges", () => {
  it("catches visually identical names with different unicode normalization", () => {
    // "Café" typed on macOS (NFD) vs pasted from the web (NFC).
    const nfc = [{ id: "a", name: "Café" }];
    expect(nameTaken(nfc, "Café")).toBe(true);
  });

  it("is not taken for an empty or whitespace-only candidate", () => {
    // Emptiness is the caller's error to report, not a collision.
    expect(nameTaken(items, "")).toBe(false);
    expect(nameTaken(items, "   ")).toBe(false);
    expect(nameTaken([], "Vacation")).toBe(false);
  });

  it("does not collapse internal whitespace", () => {
    expect(nameTaken([{ id: "a", name: "Roof fund" }], "Roof  fund")).toBe(false);
  });

  it("behaves like create when selfId matches nothing", () => {
    expect(nameTaken(items, "Vacation", "nonexistent")).toBe(true);
  });
});
