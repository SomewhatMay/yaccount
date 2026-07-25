import { describe, it, expect } from "vitest";
import {
  EXPORT_FORMAT,
  EXPORT_VERSION,
  buildExport,
  exportFileName,
  serializeExport,
  validateExport,
} from "./export";
import type { Op } from "@/core/oplog";
import { replay, MemoryTx } from "@/core/oplog";
import { STORE } from "@/core/repo/db";
import {
  makeCategory,
  makeGeneralContainer,
  makeTransaction,
  type Category,
} from "@/core/model";

const at = (ms: number): string => new Date(ms).toISOString();

const seedOp: Op = {
  id: "seed:general",
  ts: at(0),
  type: "container.create",
  payload: { row: makeGeneralContainer() },
};

const catOp = (id: string, name: string, ms: number): Op => ({
  id: `op-cat-${id}`,
  ts: at(ms),
  type: "category.create",
  payload: { row: makeCategory({ id, name, type: "expense" }) },
});

const txnOp = (id: string, ms: number): Op => ({
  id: `op-txn-${id}`,
  ts: at(ms),
  type: "transaction.create",
  payload: {
    row: makeTransaction({
      id,
      date: "2026-07-04",
      amount: -1250,
      vendor_source: "Market",
      category_id: "c1",
    }),
  },
});

const goodOps: Op[] = [seedOp, catOp("c1", "Groceries", 1000), txnOp("t1", 2000)];

/** A valid export file as the app would write it. */
function goodFile(ops: Op[] = goodOps): string {
  return serializeExport(
    buildExport({ ops, exportedAt: at(5000), deviceId: "dev-a", appDbVersion: 3 }),
  );
}

/** Mutate a parsed export and re-serialize — the "hand-edited file" path. */
function tweak(
  mutate: (file: Record<string, unknown>) => void,
  ops: Op[] = goodOps,
): string {
  const file = JSON.parse(goodFile(ops)) as Record<string, unknown>;
  mutate(file);
  return JSON.stringify(file);
}

async function expectRejected(text: string, matching: RegExp): Promise<void> {
  const result = await validateExport(text);
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.errors.join(" | ")).toMatch(matching);
}

describe("export envelope (versioned, §8.2 op set)", () => {
  it("carries the format marker, version, counts and provenance", () => {
    const file = buildExport({
      ops: goodOps,
      exportedAt: at(5000),
      deviceId: "dev-a",
      appDbVersion: 3,
    });
    expect(file.format).toBe(EXPORT_FORMAT);
    expect(file.version).toBe(EXPORT_VERSION);
    expect(file.exportedAt).toBe(at(5000));
    expect(file.deviceId).toBe("dev-a");
    expect(file.appDbVersion).toBe(3);
    expect(file.opCount).toBe(goodOps.length);
  });

  it("exports the ops in canonical total order, whatever order it is handed", () => {
    const shuffled = [goodOps[2], goodOps[0], goodOps[1]];
    const file = buildExport({ ops: shuffled, exportedAt: at(5000) });
    expect(file.ops.map((o) => o.id)).toEqual(goodOps.map((o) => o.id));
  });

  it("names the file by its export day", () => {
    expect(exportFileName(at(Date.UTC(2026, 6, 25)))).toBe(
      "yaccount-export-2026-07-25.json",
    );
  });

  it("round-trips: a built file validates and yields the same ops", async () => {
    const result = await validateExport(goodFile());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ops).toEqual(goodOps);
  });

  it("round-trips to identical materialized state (the exit criterion)", async () => {
    const result = await validateExport(goodFile());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const before = new MemoryTx(await replay(goodOps));
    const after = new MemoryTx(await replay(result.ops));
    const byId = (xs: Category[]) => Object.fromEntries(xs.map((x) => [x.id, x]));
    expect(byId(await after.getAll<Category>(STORE.categories))).toEqual(
      byId(await before.getAll<Category>(STORE.categories)),
    );
    expect(await after.getAll(STORE.transactions)).toEqual(
      await before.getAll(STORE.transactions),
    );
  });

  it("accepts an empty op set — a cleared store is a legitimate export", async () => {
    const result = await validateExport(goodFile([]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ops).toEqual([]);
  });
});

describe("validateExport — refuses anything it cannot fully verify", () => {
  it("rejects text that is not JSON", async () => {
    await expectRejected("not json at all", /could not be read|not valid JSON/i);
  });

  it("rejects JSON that is not an object", async () => {
    await expectRejected("[1,2,3]", /yaccount export/i);
  });

  it("rejects a file without the yaccount format marker", async () => {
    await expectRejected(JSON.stringify({ version: 1, ops: [] }), /yaccount export/i);
  });

  it("rejects a file written by a newer version of yaccount", async () => {
    await expectRejected(
      tweak((f) => {
        f.version = EXPORT_VERSION + 1;
      }),
      /newer version/i,
    );
  });

  it("rejects a missing or non-array op list", async () => {
    await expectRejected(
      tweak((f) => {
        delete f.ops;
      }),
      /list of changes|ops/i,
    );
    await expectRejected(
      tweak((f) => {
        f.ops = "nope";
      }),
      /list of changes|ops/i,
    );
  });

  it("rejects an opCount that disagrees with the ops (a truncated file)", async () => {
    await expectRejected(
      tweak((f) => {
        f.opCount = 99;
      }),
      /incomplete|count/i,
    );
  });

  it("rejects an op missing its id or timestamp", async () => {
    await expectRejected(
      tweak((f) => {
        (f.ops as Record<string, unknown>[])[1].id = "";
      }),
      /id/i,
    );
    await expectRejected(
      tweak((f) => {
        (f.ops as Record<string, unknown>[])[1].ts = "yesterday";
      }),
      /timestamp/i,
    );
  });

  it("rejects an op type this build does not know", async () => {
    await expectRejected(
      tweak((f) => {
        (f.ops as Record<string, unknown>[])[1].type = "category.explode";
      }),
      /category\.explode|unknown/i,
    );
  });

  it("rejects duplicate op ids", async () => {
    await expectRejected(
      tweak((f) => {
        (f.ops as Record<string, unknown>[])[2].id = (
          f.ops as Record<string, unknown>[]
        )[1].id;
      }),
      /twice|duplicate/i,
    );
  });

  it("rejects an op whose payload cannot be replayed", async () => {
    await expectRejected(
      tweak((f) => {
        (f.ops as Record<string, unknown>[])[1].payload = { nothing: true };
      }),
      /could not be replayed|payload/i,
    );
  });

  it("rejects a row that does not satisfy its table schema", async () => {
    await expectRejected(
      tweak((f) => {
        const op = (f.ops as { payload: { row: Record<string, unknown> } }[])[2];
        op.payload.row.amount = 12.5; // money is integer cents everywhere (§0.2)
      }),
      /transactions/i,
    );
  });

  it("rejects a transaction whose derived yearMonth drifted from its date (§8.3)", async () => {
    await expectRejected(
      tweak((f) => {
        const op = (f.ops as { payload: { row: Record<string, unknown> } }[])[2];
        op.payload.row.yearMonth = "2026-01";
      }),
      /transactions/i,
    );
  });

  it("names the offending row so the failure is diagnosable, not a mystery", async () => {
    const result = await validateExport(
      tweak((f) => {
        const op = (f.ops as { payload: { row: Record<string, unknown> } }[])[2];
        op.payload.row.amount = 12.5;
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(" | ")).toContain("t1");
  });
});
