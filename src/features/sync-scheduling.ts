type TimerHandle = ReturnType<typeof setTimeout>;

interface TimerApi {
  setTimeout(callback: () => void, delayMs: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
}

const defaultTimers: TimerApi = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle),
};

/** One edit timer. Immediate lifecycle work supersedes any pending edit nudge. */
export function createSyncScheduler(delayMs: number, timers: TimerApi = defaultTimers) {
  let pending: TimerHandle | null = null;

  function cancel(): void {
    if (pending === null) return;
    timers.clearTimeout(pending);
    pending = null;
  }

  return {
    debounce(run: () => void): void {
      cancel();
      pending = timers.setTimeout(() => {
        pending = null;
        run();
      }, delayMs);
    },
    immediate<T>(run: () => T): T {
      cancel();
      return run();
    },
    cancel,
  };
}

/** Serialize cycles and retain only the latest request made while one is active. */
export function createTrailingRunner<Args extends unknown[]>(
  task: (...args: Args) => Promise<void>,
): (...args: Args) => Promise<void> {
  let active: Promise<void> | null = null;
  let trailingArgs: Args | null = null;

  return (...args: Args) => {
    if (active) {
      trailingArgs = args;
      return active;
    }

    const cycle = (async () => {
      let currentArgs = args;
      for (;;) {
        trailingArgs = null;
        await task(...currentArgs);
        if (trailingArgs === null) return;
        currentArgs = trailingArgs;
      }
    })();
    active = cycle;
    void cycle.then(
      () => {
        if (active === cycle) active = null;
      },
      () => {
        if (active === cycle) active = null;
      },
    );
    return cycle;
  };
}
