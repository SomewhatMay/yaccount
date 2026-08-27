import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("iPhone PWA interaction layout", () => {
  it("opts the viewport into safe-area insets", () => {
    expect(read("../../app/layout.tsx")).toContain('viewportFit: "cover"');
  });

  it("adds bottom spacing only when the device reports a safe-area inset", () => {
    expect(read("../shell/BottomTabBar.tsx")).toContain(
      'paddingBottom: "env(safe-area-inset-bottom, 0px)"',
    );
    expect(read("../AppShell.tsx")).toContain(
      "calc(7rem + env(safe-area-inset-bottom, 0px))",
    );

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
    expect(sheet).not.toContain("offsetTop");
    expect(sheet).not.toContain("innerHeight");
    expect(sheet).toContain("requestAnimationFrame");
    expect(sheet).toContain('"scroll"');
  });

  it("scopes the sheet transition to keyboard movement", () => {
    expect(read("../../components/ui/sheet.tsx")).not.toContain("transition ");
  });

  it("does not animate after Safari reports its final keyboard resize", () => {
    const sheet = read("../../components/ui/sheet.tsx");

    expect(sheet).not.toContain("transition-[translate]");
    expect(sheet).toContain("transition-none");
  });

  it("gives phone Search explicit focus and visual-viewport geometry", () => {
    const palette = read("../shell/CommandPalette.tsx");
    const command = read("../../components/ui/command.tsx");

    expect(palette).toContain("useVisualViewportBox");
    expect(palette).toContain("autoFocus={!sideways}");
    expect(command).toContain("--visual-viewport-top");
    expect(command).toContain("--visual-viewport-height");
    expect(command).toContain("env(safe-area-inset-bottom,0px)-3.25rem");
    expect(command).toContain("max-h-none flex-1");
  });

  it("waits for the FAB click before mounting quick-add", () => {
    const fab = read("../shell/QuickAddFab.tsx");

    expect(fab).toContain("pendingPointerQuickAdd");
    expect(fab).toContain("if (pendingPointerQuickAdd.current)");
  });

  it("shows pending feedback for tab navigation", () => {
    expect(read("../shell/BottomTabBar.tsx")).toContain("useLinkStatus");
  });

  it("skips layout work for off-screen dashboard widgets", () => {
    const widget = read("../reports/WidgetShell.tsx");

    expect(widget).toContain("content-visibility");
    expect(widget).toContain("contain-intrinsic-size");
  });

  it("routes every dropdown trigger through RowActions", () => {
    const featureRoot = new URL("../", import.meta.url);
    const directTriggerImports = readdirSync(featureRoot, {
      recursive: true,
      encoding: "utf8",
    })
      .filter(
        (path) =>
          /\.tsx?$/.test(path) &&
          path !== "ui/RowActions.tsx" &&
          !path.endsWith(".test.ts"),
      )
      .filter((path) =>
        /import\s*\{[^}]*\bDropdownMenuTrigger\b[^}]*\}\s*from\s*["']@\/components\/ui\/dropdown-menu["']/s.test(
          readFileSync(new URL(path, featureRoot), "utf8"),
        ),
      )
      .sort();

    expect(directTriggerImports).toEqual([]);
  });
});
