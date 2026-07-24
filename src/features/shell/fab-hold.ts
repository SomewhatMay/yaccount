export const FAB_HOLD_MS = 500;
export const FAB_MOVE_TOLERANCE_PX = 10;

export type FabPress = {
  originX: number;
  originY: number;
  status: "pressing" | "held" | "cancelled";
};

export type FabReleaseAction = "expense" | "none";

export function startFabPress(originX: number, originY: number): FabPress {
  return { originX, originY, status: "pressing" };
}

export function moveFabPress(press: FabPress, x: number, y: number): FabPress {
  if (press.status !== "pressing") return press;
  const distance = Math.hypot(x - press.originX, y - press.originY);
  return distance > FAB_MOVE_TOLERANCE_PX ? { ...press, status: "cancelled" } : press;
}

export function holdFabPress(press: FabPress): FabPress {
  return press.status === "pressing" ? { ...press, status: "held" } : press;
}

export function cancelFabPress(press: FabPress): FabPress {
  return press.status === "pressing" ? { ...press, status: "cancelled" } : press;
}

export function releaseFabPress(press: FabPress): FabReleaseAction {
  return press.status === "pressing" ? "expense" : "none";
}
