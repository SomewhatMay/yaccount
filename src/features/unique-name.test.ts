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
