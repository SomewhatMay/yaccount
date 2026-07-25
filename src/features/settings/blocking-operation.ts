export type BlockingOperationKind = "clear" | "import" | "restore";

export type BlockingOperationState = {
  kind: BlockingOperationKind;
  status: "running";
} | null;

export const BLOCKING_OPERATION_COPY = {
  clear: "Clearing everything…",
  import: "Importing your file…",
  restore: "Rolling back your data…",
  keepOpen: "Keep yaccount open until this finishes.",
} as const;

type Result =
  | { ok: true }
  | { ok: false; reason: "busy" }
  | { ok: false; reason: "failed"; error: unknown };

export function createBlockingOperation(
  setState: (state: BlockingOperationState) => void,
) {
  let state: BlockingOperationState = null;

  return {
    busy: () => state !== null,
    async start(kind: BlockingOperationKind, task: () => Promise<void>): Promise<Result> {
      if (state) return { ok: false, reason: "busy" };

      state = { kind, status: "running" };
      setState(state);
      try {
        await task();
        return { ok: true };
      } catch (error) {
        return { ok: false, reason: "failed", error };
      } finally {
        state = null;
        setState(null);
      }
    },
  };
}

export function shouldWarnBeforeUnload(state: BlockingOperationState): boolean {
  return state !== null;
}
