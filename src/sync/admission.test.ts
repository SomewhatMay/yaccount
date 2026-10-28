import { describe, expect, it, vi } from "vitest";
import type { Op } from "@/core/oplog";
import { hasCompletedSync, runAdmittedSync, syncAdmission } from "./admission";

const seed: Op = {
  id: "seed:general",
  ts: new Date(0).toISOString(),
  type: "container.create",
  payload: {
    row: {
      id: "general",
      name: "General",
      is_investment: false,
      is_archived: false,
      include_in_overall_balance: true,
    },
  },
};

describe("syncAdmission", () => {
  it("recognizes the prior reset marker while migrating existing devices", () => {
    expect(hasCompletedSync({ completed: false, originSeen: undefined })).toBe(false);
    expect(hasCompletedSync({ completed: false, originSeen: null })).toBe(true);
    expect(hasCompletedSync({ completed: true, originSeen: undefined })).toBe(true);
  });

  it("allows seed-only and previously synced devices to sync automatically", () => {
    expect(syncAdmission({ ops: [seed], completed: false })).toBe("allow");
    expect(
      syncAdmission({ ops: [seed, { ...seed, id: "local-op" }], completed: true }),
    ).toBe("allow");
  });

  it("requires consent before a never-synced device with local data syncs", () => {
    expect(
      syncAdmission({ ops: [seed, { ...seed, id: "local-op" }], completed: false }),
    ).toBe("confirm");
  });

  it("does not sync local user data until consent, then remembers only success", async () => {
    const run = vi.fn(async () => {});
    const remember = vi.fn(async () => {});
    const deps = {
      listOps: async () => [seed, { ...seed, id: "local-op" }],
      completed: async () => false,
      run,
      remember,
    };

    await expect(runAdmittedSync(deps)).resolves.toBe("confirmation_required");
    expect(run).not.toHaveBeenCalled();
    expect(remember).not.toHaveBeenCalled();

    await expect(runAdmittedSync(deps, { consent: true })).resolves.toBe("synced");
    expect(run).toHaveBeenCalledOnce();
    expect(remember).toHaveBeenCalledOnce();
  });

  it("does not remember consent when the sync fails", async () => {
    const remember = vi.fn(async () => {});
    await expect(
      runAdmittedSync(
        {
          listOps: async () => [seed, { ...seed, id: "local-op" }],
          completed: async () => false,
          run: async () => {
            throw new Error("offline");
          },
          remember,
        },
        { consent: true },
      ),
    ).rejects.toThrow("offline");
    expect(remember).not.toHaveBeenCalled();
  });
});
