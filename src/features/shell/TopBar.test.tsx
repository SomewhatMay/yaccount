import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { Button } from "@/components/ui/button";
import { TopBar } from "@/features/shell/TopBar";

const fixture = vi.hoisted(() => ({ pending: 3 }));

vi.mock("next/link", () => ({ default: "mock-link" }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

vi.mock("jotai", () => ({
  useAtomValue: () => fixture.pending,
  useSetAtom: () => vi.fn(),
}));

vi.mock("@/features/store", () => ({
  commandPaletteAtom: "commandPalette",
  pendingCountAtom: "pendingCount",
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

it("puts badged Inbox immediately before Search", () => {
  const topbar = TopBar({ maxWidth: "max-w-2xl" });
  const children = topbar.props.children.props.children[2].props.children;
  const inbox = children.find(
    (child: { type: unknown; props: { href?: string } }) =>
      child.type === "mock-link" && child.props.href === "/inbox",
  );

  expect(inbox).toBeTruthy();
  expect(inbox.props["aria-label"]).toBe("Inbox");
  expect(inbox.props.children[1].props["aria-label"]).toBe("3 pending");
  expect(children.at(-2)).toBe(inbox);
});
