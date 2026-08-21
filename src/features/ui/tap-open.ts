export const TAP_MOVE_TOLERANCE_PX = 10;

export type TapState = {
  originX: number;
  originY: number;
  status: "pending" | "cancelled";
};

export function startTap(originX: number, originY: number): TapState {
  return { originX, originY, status: "pending" };
}

export function moveTap(state: TapState, x: number, y: number): TapState {
  if (state.status === "cancelled") return state;
  const distance = Math.hypot(x - state.originX, y - state.originY);
  return distance > TAP_MOVE_TOLERANCE_PX ? { ...state, status: "cancelled" } : state;
}

export function endTap(state: TapState): "open" | null {
  return state.status === "pending" ? "open" : null;
}
