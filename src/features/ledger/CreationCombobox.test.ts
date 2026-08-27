import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./CreationCombobox.tsx", import.meta.url), "utf8");

describe("creation combobox contract", () => {
  it("keeps focus on an accessible editable combobox", () => {
    expect(source).toContain('role="combobox"');
    expect(source).toContain('aria-autocomplete="list"');
    expect(source).toContain("aria-activedescendant");
    expect(source).toContain('role="listbox"');
    expect(source).toContain('role="option"');
    expect(source).toContain('event.key === "ArrowDown"');
    expect(source).toContain('event.key === "Enter"');
    expect(source).toContain('event.key === "Escape"');
  });

  it("shows five 40px rows plus padding on phones and eight on larger screens", () => {
    expect(source).toContain("max-h-52");
    expect(source).toContain("sm:max-h-[20.5rem]");
    expect(source).toContain("min-h-10");
  });
});
