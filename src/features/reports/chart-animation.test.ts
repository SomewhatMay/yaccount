import { expect, it, vi } from "vitest";
import type { AnimationController } from "recharts";
import { createInterruptibleAnimationController } from "./chart-animation";

type TimeoutController = Parameters<AnimationController>[0];
type AnimationHandle = Parameters<AnimationController>[1];

it("schedules Recharts frame updates as interruptible React work", () => {
  const callbacks: Array<(now: number) => void> = [];
  const cancel = vi.fn();
  const timeoutController: TimeoutController = {
    setTimeout: vi.fn((callback) => {
      callbacks.push(callback);
      return cancel;
    }),
  };
  let progress = 0.5;
  const animation = {
    tick: vi.fn(() => 0),
    getState: vi.fn(() => "active" as const),
    getInterpolated: vi.fn(() => progress),
    getProgress: vi.fn(() => progress),
    complete: vi.fn(),
  } as unknown as AnimationHandle;
  const listener = vi.fn();
  const schedule = vi.fn((update: () => void) => update());
  const controller = createInterruptibleAnimationController(schedule);

  const stop = controller(timeoutController, animation, listener);
  expect(callbacks).toHaveLength(1);

  callbacks.shift()!(100);
  expect(schedule).toHaveBeenCalledOnce();
  expect(listener).toHaveBeenCalledWith(0.5);
  expect(callbacks).toHaveLength(1);

  progress = 1;
  callbacks.shift()!(116);
  expect(animation.complete).toHaveBeenCalledOnce();
  expect(callbacks).toHaveLength(0);

  stop();
});
