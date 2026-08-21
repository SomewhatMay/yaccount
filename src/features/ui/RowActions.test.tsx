import { describe, expect, it, vi } from "vitest";
import { RowActions } from "@/features/ui/RowActions";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();

  return {
    ...actual,
    useRef: <T,>(initialValue: T) => ({ current: initialValue }),
    useState: <T,>(initialValue: T) => [initialValue, vi.fn()],
  };
});

describe("RowActions", () => {
  it("controls the menu and suppresses pointerdown opening", () => {
    const menu = RowActions({ label: "Actions for row", children: "Action" });

    expect(menu.props.open).toBe(false);
    expect(menu.props.onOpenChange).toEqual(expect.any(Function));

    const trigger = menu.props.children[0];
    const button = trigger.props.children;
    const preventDefault = vi.fn();

    expect(button.props.onPointerDown).toEqual(expect.any(Function));
    button.props.onPointerDown({ preventDefault, clientX: 10, clientY: 20 });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(button.props.className).toContain("touch-pan-y");
  });
});
