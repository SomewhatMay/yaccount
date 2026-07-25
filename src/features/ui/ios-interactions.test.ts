import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("iPhone PWA interaction layout", () => {
  it("opts the viewport into safe-area insets", () => {
    expect(read("../../app/layout.tsx")).toContain('viewportFit: "cover"');
  });

  it("uses the same nonzero safe-area fallback for nav, page, FAB, and chooser", () => {
    const fallback = "calc(0.5rem + env(safe-area-inset-bottom, 0px))";

    expect(read("../shell/BottomTabBar.tsx")).toContain(fallback);
    expect(read("../AppShell.tsx")).toContain(fallback);

    const fab = read("../shell/QuickAddFab.tsx");
    expect(fab.match(/env\(safe-area-inset-bottom,\s*0px\)/g)).toHaveLength(2);
  });

  it("prevents selection and native touch gestures only on the FAB interaction", () => {
    const fab = read("../shell/QuickAddFab.tsx");

    expect(fab).toContain("select-none");
    expect(fab).toContain("[-webkit-user-select:none]");
    expect(fab).toContain("touch-none");
    expect(read("../../app/globals.css")).not.toContain("* { user-select: none");
  });

  it("contains bottom-sheet scrolling to the vertical axis", () => {
    const sheet = read("./ResponsiveSheet.tsx");

    expect(sheet).toContain("overflow-x-hidden");
    expect(sheet).toContain("overflow-y-auto");
    expect(sheet).toContain("touch-pan-y");
    expect(sheet).not.toContain("scrollIntoView");

    const primitive = read("../../components/ui/sheet.tsx");
    expect(primitive).toContain("data-sheet-bottom-bleed");
    expect(primitive).toContain("pointer-events-none");
  });

  it("waits for the FAB click before mounting quick-add", () => {
    const fab = read("../shell/QuickAddFab.tsx");

    expect(fab).toContain("pendingPointerQuickAdd");
    expect(fab).toContain("if (pendingPointerQuickAdd.current)");
  });
});
