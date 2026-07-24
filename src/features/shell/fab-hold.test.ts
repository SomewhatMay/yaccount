import { describe, expect, it } from "vitest";
import {
  FAB_HOLD_MS,
  FAB_MOVE_TOLERANCE_PX,
  cancelFabPress,
  holdFabPress,
  moveFabPress,
  releaseFabPress,
  startFabPress,
} from "./fab-hold";

describe("FAB hold gesture", () => {
  it("locks the activation threshold and movement tolerance", () => {
    expect(FAB_HOLD_MS).toBe(500);
    expect(FAB_MOVE_TOLERANCE_PX).toBe(10);
  });

  it("releases a stationary press before threshold as one expense action", () => {
    const press = startFabPress(12, 24);

    expect(releaseFabPress(press)).toBe("expense");
  });

  it("opens the chooser at threshold and suppresses the release action", () => {
    const held = holdFabPress(startFabPress(12, 24));

    expect(held.status).toBe("held");
    expect(releaseFabPress(held)).toBe("none");
  });

  it("keeps movement at the tolerance and cancels beyond it", () => {
    const press = startFabPress(0, 0);

    expect(moveFabPress(press, 6, 8).status).toBe("pressing");
    expect(moveFabPress(press, 6.1, 8).status).toBe("cancelled");
    expect(releaseFabPress(moveFabPress(press, 11, 0))).toBe("none");
  });

  it.each(["pointer cancellation", "lost capture", "Escape"])(
    "suppresses release after %s",
    () => {
      const cancelled = cancelFabPress(startFabPress(0, 0));

      expect(cancelled.status).toBe("cancelled");
      expect(releaseFabPress(cancelled)).toBe("none");
      expect(holdFabPress(cancelled).status).toBe("cancelled");
    },
  );
});
