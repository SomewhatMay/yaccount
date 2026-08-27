import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("craving win entry points", () => {
  it("mounts the global sheet", () => {
    const shell = read("../AppShell.tsx");

    expect(shell).toContain("CravingWinSheet");
    expect(shell).toContain("<CravingWinSheet />");
  });

  it("offers an action in the command palette", () => {
    const palette = read("../shell/CommandPalette.tsx");

    expect(palette).toContain("cravingWinSheetAtom");
    expect(palette).toContain('title: "Log a craving win"');
    expect(palette).toContain('openCravingWin("new")');
  });

  it("puts the action before saved shortcuts in the FAB hold menu", () => {
    const fab = read("../shell/QuickAddFab.tsx");

    expect(fab).toContain("cravingWinSheetAtom");
    expect(fab).toContain('aria-label="Log a craving win"');
    expect(fab.indexOf('aria-label="Log a craving win"')).toBeLessThan(
      fab.indexOf("rankedTemplates.map"),
    );
  });
});
