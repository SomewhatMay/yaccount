import { describe, expect, it, vi } from "vitest";
import { QuickAddFab } from "@/features/shell/QuickAddFab";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();

  return {
    ...actual,
    useCallback: <T,>(callback: T) => callback,
    useEffect: vi.fn(),
    useMemo: <T,>(factory: () => T) => factory(),
    useRef: <T,>(initialValue: T) => ({ current: initialValue }),
    useState: <T,>(initialValue: T) => [initialValue, vi.fn()],
  };
});

vi.mock("jotai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("jotai")>();

  return {
    ...actual,
    useAtomValue: () => [],
    useSetAtom: () => vi.fn(),
  };
});

describe("QuickAddFab", () => {
  it("focuses mouse presses but not touch presses", () => {
    const fab = QuickAddFab().props.children[0];
    const onPointerDown = fab.props.onPointerDown;

    function press(pointerType: "touch" | "mouse") {
      const focus = vi.fn();
      onPointerDown({
        isPrimary: true,
        pointerType,
        button: 0,
        pointerId: 1,
        clientX: 10,
        clientY: 20,
        preventDefault: vi.fn(),
        currentTarget: { focus, setPointerCapture: vi.fn() },
      });
      return focus;
    }

    expect(press("touch")).not.toHaveBeenCalled();
    expect(press("mouse")).toHaveBeenCalledOnce();
  });
});
