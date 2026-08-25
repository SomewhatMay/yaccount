import { isValidElement, type ReactElement, type ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { AppearancePanel } from "@/features/settings/AppearancePanel";

const fixture = vi.hoisted(() => ({
  theme: "system" as string | undefined,
  setTheme: vi.fn(),
}));

vi.mock("next-themes", () => ({
  useTheme: () => fixture,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) =>
      getSnapshot(),
  };
});

function findAll(
  node: ReactNode,
  type: unknown,
): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap((child) => findAll(child, type));
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  const here = node.type === type ? [node as ReactElement<Record<string, unknown>>] : [];
  return [...here, ...findAll(node.props.children, type)];
}

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  if (!isValidElement<{ children?: ReactNode }>(node)) return "";
  return textOf(node.props.children);
}

it("offers System, Light, and Dark as one recoverable theme choice", () => {
  fixture.setTheme.mockClear();
  const panel = AppearancePanel();
  const group = findAll(panel, ToggleGroup)[0];
  const items = findAll(panel, ToggleGroupItem);

  expect(group.props.type).toBe("single");
  expect(group.props.value).toBe("system");
  expect(items.map((item) => textOf(item).trim())).toEqual(["System", "Light", "Dark"]);

  const onValueChange = group.props.onValueChange as (value: string) => void;
  onValueChange("dark");
  expect(fixture.setTheme).toHaveBeenLastCalledWith("dark");

  onValueChange("");
  expect(fixture.setTheme).toHaveBeenCalledTimes(1);
});

it("keeps theme changes in Settings only", () => {
  const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
  const settings = source("./SettingsView.tsx");

  expect(settings).toContain("AppearancePanel");
  for (const path of [
    "../shell/TopBar.tsx",
    "../shell/MoreSheet.tsx",
    "../shell/CommandPalette.tsx",
  ]) {
    expect(source(path)).not.toContain("ThemeToggle");
    expect(source(path)).not.toContain("useTheme");
  }
  expect(source("../shell/CommandPalette.tsx")).not.toContain("act:theme");
});
import { readFileSync } from "node:fs";
