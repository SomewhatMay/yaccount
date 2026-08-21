import { describe, expect, it } from "vitest";
import { endTap, moveTap, startTap } from "@/features/ui/tap-open";

describe("tap-open gesture", () => {
  it("starts pending", () => {
    expect(startTap(10, 20)).toEqual({
      originX: 10,
      originY: 20,
      status: "pending",
    });
  });

  it("stays pending within the movement threshold", () => {
    expect(moveTap(startTap(10, 20), 13, 22).status).toBe("pending");
  });

  it("cancels beyond the movement threshold", () => {
    expect(moveTap(startTap(10, 20), 10, 32).status).toBe("cancelled");
  });

  it("opens only a pending tap", () => {
    expect(endTap(startTap(10, 20))).toBe("open");
    expect(endTap(moveTap(startTap(10, 20), 10, 32))).toBeNull();
  });

  it("keeps a cancelled tap cancelled", () => {
    const cancelled = moveTap(startTap(10, 20), 10, 32);

    expect(moveTap(cancelled, 10, 20).status).toBe("cancelled");
  });
});
