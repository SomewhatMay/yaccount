import { describe, expect, it, vi } from "vitest";
import { BottomTabBar } from "@/features/shell/BottomTabBar";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();

  return {
    ...actual,
    useRef: <T,>(initialValue: T) => ({ current: initialValue }),
  };
});

vi.mock("next/link", () => ({
  default: "mock-link",
  useLinkStatus: () => ({ pending: false }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

describe("BottomTabBar", () => {
  it("activates a stationary touch on pointerup but cancels movement", () => {
    const slots = BottomTabBar({ onMore: vi.fn() }).props.children.props.children;
    const ledger = slots[1].props.children;
    const click = vi.fn();
    const preventDefault = vi.fn();

    ledger.props.onPointerDown({
      pointerType: "touch",
      isPrimary: true,
      pointerId: 1,
      clientX: 10,
      clientY: 20,
      preventDefault,
      currentTarget: { setPointerCapture: vi.fn() },
    });
    ledger.props.onPointerUp({
      pointerId: 1,
      preventDefault,
      currentTarget: { click },
    });

    expect(preventDefault).toHaveBeenCalled();
    expect(click).toHaveBeenCalledOnce();

    ledger.props.onPointerDown({
      pointerType: "touch",
      isPrimary: true,
      pointerId: 2,
      clientX: 10,
      clientY: 20,
      preventDefault: vi.fn(),
      currentTarget: { setPointerCapture: vi.fn() },
    });
    ledger.props.onPointerMove({ pointerId: 2, clientX: 21, clientY: 20 });
    ledger.props.onPointerUp({
      pointerId: 2,
      preventDefault: vi.fn(),
      currentTarget: { click },
    });

    expect(click).toHaveBeenCalledOnce();

    ledger.props.onPointerDown({
      pointerType: "mouse",
      isPrimary: true,
      pointerId: 3,
      clientX: 10,
      clientY: 20,
      preventDefault: vi.fn(),
      currentTarget: { setPointerCapture: vi.fn() },
    });
    ledger.props.onPointerUp({
      pointerId: 3,
      preventDefault: vi.fn(),
      currentTarget: { click },
    });

    expect(click).toHaveBeenCalledOnce();
  });
});
