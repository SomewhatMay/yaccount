import { describe, expect, it, vi } from "vitest";
import { BlockingOperationOverlay } from "@/features/settings/BlockingOperationOverlay";

describe("BlockingOperationOverlay", () => {
  it("is a permanently open modal with live alert semantics and no dismiss control", () => {
    const overlay = BlockingOperationOverlay({
      operation: { kind: "clear", status: "running" },
    });
    const content = overlay.props.children;
    const description = content.props.children.props.children[2];

    expect(overlay.props.open).toBe(true);
    expect(content.props["aria-busy"]).toBe("true");
    expect(description.props.role).toBe("status");
    expect(description.props["aria-live"]).toBe("assertive");
    expect(Array.isArray(content.props.children)).toBe(false);

    const preventDefault = vi.fn();
    content.props.onEscapeKeyDown({ preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
  });

  it.each([
    ["clear", "Clearing everything…"],
    ["import", "Importing your file…"],
    ["restore", "Rolling back your data…"],
  ] as const)("shows %s progress and the keep-open warning", (kind, copy) => {
    const overlay = BlockingOperationOverlay({
      operation: { kind, status: "running" },
    });
    const header = overlay.props.children.props.children;
    const [, title, description] = header.props.children;

    expect(title.props.children).toBe(copy);
    expect(description.props.children).toBe("Keep yaccount open until this finishes.");
  });
});
