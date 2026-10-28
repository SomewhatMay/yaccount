import type { Op } from "@/core/oplog";

const SEED_GENERAL_OP_ID = "seed:general";
export const SYNC_COMPLETED_META_KEY = "sync:completed";

export type SyncAdmission = "allow" | "confirm";

/** `sync:origin` is a one-time compatibility signal from earlier sync releases. */
export function hasCompletedSync(input: {
  completed: boolean;
  originSeen: string | null | undefined;
}): boolean {
  return input.completed || input.originSeen !== undefined;
}

/** A new repo contains only this deterministic seed. Any other op is user data. */
export function syncAdmission(input: { ops: Op[]; completed: boolean }): SyncAdmission {
  if (input.completed || input.ops.every((op) => op.id === SEED_GENERAL_OP_ID))
    return "allow";
  return "confirm";
}

export interface SyncAdmissionDeps {
  listOps(): Promise<Op[]>;
  completed(): Promise<boolean>;
  run(): Promise<void>;
  remember(): Promise<void>;
}

/** Runs only an admitted cycle. Completion is durable only after it succeeds. */
export async function runAdmittedSync(
  deps: SyncAdmissionDeps,
  options: { consent?: boolean } = {},
): Promise<"synced" | "confirmation_required"> {
  const admission = syncAdmission({
    ops: await deps.listOps(),
    completed: await deps.completed(),
  });
  if (admission === "confirm" && !options.consent) return "confirmation_required";
  await deps.run();
  await deps.remember();
  return "synced";
}
