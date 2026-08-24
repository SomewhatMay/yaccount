import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { Button } from "@/components/ui/button";
import { TopBar } from "@/features/shell/TopBar";

vi.mock("next/link", () => ({ default: "mock-link" }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

vi.mock("jotai", () => ({
  useSetAtom: () => vi.fn(),
}));

vi.mock("@/features/store", () => ({
  commandPaletteAtom: "commandPalette",
}));

vi.mock("@/features/auth/AuthButton", () => ({
  AuthButton: () => null,
}));

vi.mock("@/features/SyncIndicator", () => ({
  SyncIndicator: () => null,
}));

vi.mock("@/features/shell/ThemeToggle", () => ({
  ThemeToggle: () => null,
}));

it("keeps search visible at every width and last in the topbar", () => {
  const topbar = TopBar({ maxWidth: "max-w-2xl" });
  const actions = topbar.props.children.props.children[2];
  const children = actions.props.children;
  const search = children.find(
    (child: { type: unknown; props: { "aria-label"?: string } }) =>
      child.type === Button && child.props["aria-label"] === "Search yaccount",
  );

  expect(search).toBeTruthy();
  expect(search.props.className).not.toMatch(/\bhidden\b/);
  expect(search.props.children[1].props.className).toMatch(/\bhidden\b/);
  expect(children.at(-1)).toBe(search);
});

it("does not duplicate search in More", () => {
  const more = readFileSync(new URL("./MoreSheet.tsx", import.meta.url), "utf8");

  expect(more).not.toContain("SearchIcon");
  expect(more).not.toContain("commandPaletteAtom");
});
