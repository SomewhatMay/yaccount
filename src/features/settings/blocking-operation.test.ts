import { describe, expect, it, vi } from "vitest";
import {
  BLOCKING_OPERATION_COPY,
  createBlockingOperation,
  shouldWarnBeforeUnload,
  type BlockingOperationState,
} from "@/features/settings/blocking-operation";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe("blocking data operations", () => {
  it("becomes busy synchronously and stays busy through the complete task", async () => {
    const work = deferred();
    const states: BlockingOperationState[] = [];
    const operation = createBlockingOperation((state) => states.push(state));

    const running = operation.start("clear", () => work.promise);

    expect(operation.busy()).toBe(true);
    expect(states.at(-1)).toEqual({ kind: "clear", status: "running" });

    work.resolve();
    await running;

    expect(operation.busy()).toBe(false);
    expect(states.at(-1)).toBeNull();
  });

  it("guards duplicate execution while the first task is running", async () => {
    const work = deferred();
    const task = vi.fn(() => work.promise);
    const operation = createBlockingOperation(() => undefined);

    const first = operation.start("import", task);
    const duplicate = operation.start("import", task);

    expect(task).toHaveBeenCalledTimes(1);
    expect(await duplicate).toEqual({ ok: false, reason: "busy" });
    work.resolve();
    await expect(first).resolves.toEqual({ ok: true });
  });

  it("settles failures, exposes the error, and allows a safe retry", async () => {
    const states: BlockingOperationState[] = [];
    const operation = createBlockingOperation((state) => states.push(state));
    const failed = deferred();

    const running = operation.start("restore", () => failed.promise);
    failed.reject(new Error("Drive unavailable"));

    await expect(running).resolves.toMatchObject({
      ok: false,
      reason: "failed",
      error: new Error("Drive unavailable"),
    });
    expect(operation.busy()).toBe(false);
    expect(states.at(-1)).toBeNull();

    await expect(operation.start("restore", async () => undefined)).resolves.toEqual({
      ok: true,
    });
  });

  it("provides operation-specific copy and the keep-open warning", () => {
    expect(BLOCKING_OPERATION_COPY.clear).toBe("Clearing everything…");
    expect(BLOCKING_OPERATION_COPY.import).toBe("Importing your file…");
    expect(BLOCKING_OPERATION_COPY.restore).toBe("Rolling back your data…");
    expect(BLOCKING_OPERATION_COPY.keepOpen).toBe(
      "Keep yaccount open until this finishes.",
    );
  });

  it("warns before unload only while replacement work is active", () => {
    expect(shouldWarnBeforeUnload(null)).toBe(false);
    expect(shouldWarnBeforeUnload({ kind: "clear", status: "running" })).toBe(true);
  });
});
