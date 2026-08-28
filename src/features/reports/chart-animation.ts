"use client";

import { startTransition } from "react";
import type { AnimationController } from "recharts";

type UpdateScheduler = (update: () => void) => void;

/**
 * Recharts updates geometry through React state on every animation frame. Mark
 * those decorative updates as transitions so clicks and other user input can
 * interrupt them without changing Recharts' native interpolation.
 */
export function createInterruptibleAnimationController(
  scheduleUpdate: UpdateScheduler = startTransition,
): AnimationController {
  return (timeoutController, animation, listener) => {
    let cancelCurrent: (() => void) | undefined;

    const nextUpdate = (now: number) => {
      const timeRemaining = animation.tick(now);

      if (animation.getState() === "active") {
        scheduleUpdate(() => listener(animation.getInterpolated()));
        if (animation.getProgress() === 1) {
          animation.complete();
          cancelCurrent = undefined;
          return;
        }
      }

      cancelCurrent = timeoutController.setTimeout(nextUpdate, timeRemaining);
    };

    cancelCurrent = timeoutController.setTimeout(nextUpdate, 0);
    return () => cancelCurrent?.();
  };
}

export const interruptibleAnimationController = createInterruptibleAnimationController();
