import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import {
  createSyncScheduler,
  createTrailingRunner,
} from "@/features/sync-scheduling";

afterEach(() => vi.useRealTimers());

it("debounces edit bursts from the final request", () => {
  vi.useFakeTimers();
  const scheduler = createSyncScheduler(1500);
  const first = vi.fn();
  const last = vi.fn();

  scheduler.debounce(first);
  vi.advanceTimersByTime(1000);
  scheduler.debounce(last);
  vi.advanceTimersByTime(1499);
  expect(first).not.toHaveBeenCalled();
  expect(last).not.toHaveBeenCalled();

  vi.advanceTimersByTime(1);
  expect(first).not.toHaveBeenCalled();
  expect(last).toHaveBeenCalledOnce();
});

it("runs immediate work now and cancels a pending edit sync", () => {
  vi.useFakeTimers();
  const scheduler = createSyncScheduler(1500);
  const delayed = vi.fn();
  const immediate = vi.fn(() => "started");

  scheduler.debounce(delayed);
  expect(scheduler.immediate(immediate)).toBe("started");
  expect(immediate).toHaveBeenCalledOnce();
  vi.runAllTimers();
  expect(delayed).not.toHaveBeenCalled();
});

it("runs one trailing cycle with the latest request and never overlaps", async () => {
  const releases: Array<() => void> = [];
  let active = 0;
  let maxActive = 0;
  const task = vi.fn(
    (request: number) =>
      new Promise<void>((resolve) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        releases.push(() => {
          active -= 1;
          resolve();
        });
      }),
  );
  const run = createTrailingRunner(task);

  const cycle = run(1);
  void run(2);
  void run(3);
  expect(task.mock.calls).toEqual([[1]]);

  releases.shift()!();
  await vi.waitFor(() => expect(task.mock.calls).toEqual([[1], [3]]));
  expect(maxActive).toBe(1);
  releases.shift()!();
  await cycle;
  expect(maxActive).toBe(1);
});

it("routes lifecycle triggers immediately and listens for network recovery", () => {
  const store = readFileSync(new URL("./store.ts", import.meta.url), "utf8");
  const bootstrap = readFileSync(new URL("./RepoBootstrap.tsx", import.meta.url), "utf8");
  const auth = readFileSync(new URL("./auth/AuthButton.tsx", import.meta.url), "utf8");
  const indicator = readFileSync(new URL("./SyncIndicator.tsx", import.meta.url), "utf8");

  expect(store.match(/scheduleSync\(set\)/g)).toHaveLength(2);
  expect(store).toContain("syncScheduler.debounce");
  expect(store).toContain("syncScheduler.immediate");
  expect(bootstrap).toContain("syncNowAtom");
  expect(auth).toContain("syncNowAtom");
  expect(indicator).toContain("syncNowAtom");
  expect(bootstrap).toContain('window.addEventListener("online", tick)');
  expect(bootstrap).toContain('window.removeEventListener("online", tick)');
});
