import { describe, it, expect } from "vitest";
import {
  approveDistributed,
  createDistributedIncome,
  createTransaction,
  logTemplateOps,
  reconcileDistribution,
  setDefaultDistribution,
  setDistributionPreset,
  splitPieceId,
  unvoidDistribution,
  voidDistribution,
} from "@/core/commands";
import {
  DISTRIBUTION_DEFAULT_KEY,
  distributionKey,
  makeContainer,
  makeDistributionPreset,
  makeTemplate,
  makeTransaction,
  parseDistributionPreset,
  type Container,
  type Transaction,
} from "@/core/model";
import { replay, type Op } from "@/core/oplog";
import { STORE } from "@/core/repo/db";
import { containerBalance } from "@/core/engine/balances";
import { activeRows } from "@/core/engine/ledger";
import {
  distributionPieces,
  hideDistributionPieces,
  splitIncome,
} from "@/core/engine/distribution";
import { goalContributed } from "@/core/engine/goals";
import { makeGoal } from "@/core/model";

const containers: Container[] = [
  makeContainer({ id: "general", name: "General" }),
  makeContainer({ id: "savings", name: "Savings" }),
  makeContainer({ id: "invest", name: "Invest" }),
];

const preset = makeDistributionPreset({
  id: "p1",
  name: "Paycheck",
  rest_container_id: "general",
  parts: [
    { container_id: "savings", bps: 2000 },
    { container_id: "invest", bps: 3300 },
  ],
});

function okSplit(amount: number, p = preset) {
  const split = splitIncome(amount, p, containers);
  if (!split.ok) throw new Error(split.reason);
  return split;
}

async function rowsOf(ops: Op[]): Promise<Transaction[]> {
  const state = await replay(ops);
  return [...(state.get(STORE.transactions)?.values() ?? [])] as Transaction[];
}

const T1 = { ts: "2026-10-29T09:00:00.000Z" };
const T2 = { ts: "2026-10-29T10:00:00.000Z" };
const T3 = { ts: "2026-10-29T11:00:00.000Z" };

const income = {
  id: "pay",
  date: "2026-10-29",
  amount: 300000,
  vendor_source: "Paycheck",
  category_id: "salary",
  entered_at: "2026-10-29T09:00:00.000Z",
};

describe("createDistributedIncome", () => {
  it("writes the income into rest, then one transfer per non-zero piece", async () => {
    const ops = createDistributedIncome({
      ...income,
      preset_id: "p1",
      split: okSplit(300000),
    });
    expect(ops.map((o) => o.type)).toEqual([
      "transaction.create",
      "transaction.create",
      "transaction.create",
    ]);
    const rows = await rowsOf(ops);
    const parent = rows.find((r) => r.id === "pay")!;
    expect(parent.container_id).toBe("general");
    expect(parent.distribution_preset_id).toBe("p1");
    expect(parent.amount).toBe(300000);

    const pieces = rows
      .filter((r) => r.distribution_parent_id === "pay")
      .sort((a, b) => b.amount - a.amount);
    expect(
      pieces.map((p) => [p.id, p.container_id, p.to_container_id, p.amount]),
    ).toEqual([
      [splitPieceId("pay", "savings"), "general", "savings", -60000],
      [splitPieceId("pay", "invest"), "general", "invest", -99000],
    ]);
    for (const p of pieces) {
      expect(p.vendor_source).toBe("Paycheck");
      expect(p.date).toBe("2026-10-29");
      expect(p.entered_at).toBe(parent.entered_at);
      expect(p.category_id).toBeNull();
      expect(p.inbox_status).toBe("approved");
    }
  });

  it("lands every cent: balances add up to the gross, goals see contributions", async () => {
    const rows = await rowsOf(
      createDistributedIncome({
        ...income,
        amount: 100001,
        preset_id: "p1",
        split: okSplit(100001),
      }),
    );
    const g = containerBalance(rows, "general");
    const s = containerBalance(rows, "savings");
    const i = containerBalance(rows, "invest");
    expect(s).toBe(20000);
    expect(i).toBe(33000);
    expect(g + s + i).toBe(100001);
    // Progress is transfers in (§4.6) — a distribution is a contribution.
    const goal = makeGoal({
      container_id: "savings",
      kind: "spend_down",
      mode: "passive",
      created_date: "2026-01-01",
    });
    expect(goalContributed(goal, rows)).toBe(20000);
  });

  it("shows as ONE register row", async () => {
    const rows = await rowsOf(
      createDistributedIncome({ ...income, preset_id: "p1", split: okSplit(300000) }),
    );
    expect(hideDistributionPieces(activeRows(rows)).map((r) => r.id)).toEqual(["pay"]);
  });

  it("refuses a split computed for a different amount", () => {
    expect(() =>
      createDistributedIncome({ ...income, preset_id: "p1", split: okSplit(1000) }),
    ).toThrow();
  });
});

describe("approveDistributed — the split happens at approve", () => {
  const pending = makeTransaction({
    id: "rule:2026-10-31",
    date: "2026-10-31",
    amount: 300000,
    vendor_source: "Paycheck",
    category_id: "salary",
    container_id: "general",
    inbox_status: "pending",
    recurring_rule_id: "rule",
    recurring_occurrence_date: "2026-10-31",
    distribution_preset_id: "p1",
    entered_at: "2026-10-31T00:00:00.000Z",
  });
  const seed: Op = {
    id: "gen",
    ts: "2026-10-01T00:00:00.000Z",
    type: "transaction.create",
    payload: { row: pending },
  };

  it("approves the occurrence and writes its pieces in one batch", async () => {
    const rows = await rowsOf([
      seed,
      ...approveDistributed(pending, "p1", okSplit(300000), T2),
    ]);
    expect(rows.find((r) => r.id === pending.id)?.inbox_status).toBe("approved");
    expect(distributionPieces(activeRows(rows)).get(pending.id)).toHaveLength(2);
    expect(containerBalance(rows, "savings")).toBe(60000);
  });

  it("converges when two devices approve the same occurrence — no doubled pieces", async () => {
    const deviceA = approveDistributed(pending, "p1", okSplit(300000), {
      ts: "2026-11-01T08:00:00.000Z",
    });
    const deviceB = approveDistributed(pending, "p1", okSplit(300000), {
      ts: "2026-11-01T09:00:00.000Z",
    });
    const rows = await rowsOf([seed, ...deviceA, ...deviceB]);
    expect(rows.filter((r) => r.distribution_parent_id === pending.id)).toHaveLength(2);
    expect(containerBalance(rows, "savings")).toBe(60000);
    expect(
      containerBalance(rows, "general") +
        containerBalance(rows, "savings") +
        containerBalance(rows, "invest"),
    ).toBe(300000);
  });

  it("moves the income into the preset's rest container when the rule's differs", async () => {
    const elsewhere = { ...pending, container_id: "savings" };
    const rows = await rowsOf([
      { ...seed, payload: { row: elsewhere } },
      ...approveDistributed(elsewhere, "p1", okSplit(300000), T2),
    ]);
    const parent = rows.find((r) => r.id === pending.id)!;
    expect(parent.container_id).toBe("general");
    expect(parent.inbox_status).toBe("approved");
  });
});

describe("reconcileDistribution — edits carry the group with them", () => {
  async function seeded() {
    const ops = createDistributedIncome(
      { ...income, preset_id: "p1", split: okSplit(300000) },
      T1,
    );
    const rows = await rowsOf(ops);
    const live = activeRows(rows);
    return {
      ops,
      rows,
      parent: live.find((r) => r.id === "pay")!,
      pieces: distributionPieces(live).get("pay")!,
    };
  }

  it("re-splits a new amount: pieces updated in place, balances exact", async () => {
    const { ops, rows, parent, pieces } = await seeded();
    const edited = { ...parent, amount: 320000 };
    const split = okSplit(320000);
    const next = reconcileDistribution(
      {
        parent: edited,
        livePieces: pieces,
        desired: split.pieces,
        allTxns: rows,
      },
      T2,
    );
    expect(next.every((o) => o.type === "transaction.update")).toBe(true);
    const after = await rowsOf([...ops, ...next]);
    expect(containerBalance(after, "savings")).toBe(64000);
    expect(containerBalance(after, "invest")).toBe(105600);
    expect(containerBalance(after, "general")).toBe(150400);
  });

  it("carries a new date and payee onto the pieces", async () => {
    const { ops, rows, parent, pieces } = await seeded();
    const edited = {
      ...parent,
      date: "2026-10-30",
      yearMonth: "2026-10",
      vendor_source: "Acme",
    };
    const next = reconcileDistribution(
      {
        parent: edited,
        livePieces: pieces,
        desired: pieces.map((p) => ({
          container_id: p.to_container_id!,
          amount: -p.amount,
        })),
        allTxns: rows,
      },
      T2,
    );
    const after = activeRows(await rowsOf([...ops, ...next]));
    for (const p of distributionPieces(after).get("pay")!) {
      expect(p.date).toBe("2026-10-30");
      expect(p.vendor_source).toBe("Acme");
    }
  });

  it("writes only the parent when nothing about the pieces changed", async () => {
    const { rows, parent, pieces } = await seeded();
    const next = reconcileDistribution(
      {
        parent: { ...parent, notes: "October" },
        livePieces: pieces,
        desired: pieces.map((p) => ({
          container_id: p.to_container_id!,
          amount: -p.amount,
        })),
        allTxns: rows,
      },
      T2,
    );
    expect(next).toHaveLength(1);
  });

  it("voids pieces that are no longer wanted (untick Distribute) — reversibly", async () => {
    const { ops, rows, parent, pieces } = await seeded();
    const next = reconcileDistribution(
      {
        parent: { ...parent, distribution_preset_id: null },
        livePieces: pieces,
        desired: [],
        allTxns: rows,
      },
      T2,
    );
    expect(next.filter((o) => o.type === "transaction.void")).toHaveLength(2);
    const after = await rowsOf([...ops, ...next]);
    expect(containerBalance(after, "general")).toBe(300000);
    expect(containerBalance(after, "savings")).toBe(0);
    expect(distributionPieces(activeRows(after)).get("pay")).toBeUndefined();
  });

  it("never reuses the id of a voided piece when a container comes back", async () => {
    const { ops, rows, parent, pieces } = await seeded();
    const off = reconcileDistribution(
      {
        parent: { ...parent, distribution_preset_id: null },
        livePieces: pieces,
        desired: [],
        allTxns: rows,
      },
      T2,
    );
    const offRows = await rowsOf([...ops, ...off]);
    const on = reconcileDistribution(
      {
        parent: { ...parent, distribution_preset_id: "p1" },
        livePieces: [],
        desired: okSplit(300000).pieces,
        allTxns: offRows,
      },
      T3,
    );
    const created = on.filter((o) => o.type === "transaction.create");
    expect(created).toHaveLength(2);
    for (const o of created) {
      if (o.type !== "transaction.create") continue;
      expect(o.payload.row.id).not.toBe(
        splitPieceId("pay", o.payload.row.to_container_id!),
      );
    }
    const after = await rowsOf([...ops, ...off, ...on]);
    expect(containerBalance(after, "savings")).toBe(60000);
    expect(
      containerBalance(after, "general") +
        containerBalance(after, "savings") +
        containerBalance(after, "invest"),
    ).toBe(300000);
  });

  it("follows a new rest container — pieces now leave from it", async () => {
    const { ops, rows, parent, pieces } = await seeded();
    const next = reconcileDistribution(
      {
        parent: { ...parent, container_id: "savings" },
        livePieces: pieces,
        desired: [{ container_id: "invest", amount: 99000 }],
        allTxns: rows,
      },
      T2,
    );
    const after = await rowsOf([...ops, ...next]);
    expect(containerBalance(after, "invest")).toBe(99000);
    expect(containerBalance(after, "savings")).toBe(201000);
    expect(containerBalance(after, "general")).toBe(0);
  });

  it("collapses duplicate live pieces into one (a concurrent-writer leftover)", async () => {
    const { ops, rows, parent, pieces } = await seeded();
    const dupe = { ...pieces[0], id: "dupe" };
    const withDupe: Op = {
      id: "dupe-op",
      ts: "2026-10-29T09:30:00.000Z",
      type: "transaction.create",
      payload: { row: dupe },
    };
    const allRows = [...rows, dupe];
    const next = reconcileDistribution(
      {
        parent,
        livePieces: [...pieces, dupe],
        desired: okSplit(300000).pieces,
        allTxns: allRows,
      },
      T2,
    );
    const after = await rowsOf([...ops, withDupe, ...next]);
    expect(containerBalance(after, "savings")).toBe(60000);
  });
});

describe("voidDistribution / unvoidDistribution — delete and undo the whole group", () => {
  it("voids the parent and every piece, then brings all of them back", async () => {
    const ops = createDistributedIncome(
      { ...income, preset_id: "p1", split: okSplit(300000) },
      T1,
    );
    const rows = await rowsOf(ops);
    const live = activeRows(rows);
    const parent = live.find((r) => r.id === "pay")!;
    const pieces = distributionPieces(live).get("pay")!;

    const removed = voidDistribution(parent, pieces, T2);
    expect(removed.ops).toHaveLength(3);
    const gone = await rowsOf([...ops, ...removed.ops]);
    expect(activeRows(gone)).toHaveLength(0);
    for (const c of ["general", "savings", "invest"])
      expect(containerBalance(gone, c)).toBe(0);

    const back = await rowsOf([
      ...ops,
      ...removed.ops,
      ...unvoidDistribution(removed.voidRows, T3),
    ]);
    expect(hideDistributionPieces(activeRows(back)).map((r) => r.id)).toEqual(["pay"]);
    expect(containerBalance(back, "savings")).toBe(60000);
  });
});

describe("logTemplateOps — shortcuts keep their preset", () => {
  const template = makeTemplate({
    template_name: "Paycheck",
    amount: 300000,
    vendor_source: "Paycheck",
    container_id: "general",
    category_id: "salary",
    distribution_preset_id: "p1",
  });

  it("splits when a usable split is supplied", async () => {
    const rows = await rowsOf(
      logTemplateOps(
        template,
        { date: "2026-10-29", id: "t" },
        { presetId: "p1", split: okSplit(300000) },
      ),
    );
    expect(rows.find((r) => r.id === "t")?.distribution_preset_id).toBe("p1");
    expect(containerBalance(rows, "savings")).toBe(60000);
  });

  it("logs one row into the template's container when the preset can't split", async () => {
    const rows = await rowsOf(
      logTemplateOps(template, { date: "2026-10-29", id: "t" }, null),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].distribution_preset_id).toBeNull();
    expect(rows[0].container_id).toBe("general");
  });
});

describe("preset settings", () => {
  it("stores a preset under its own key", () => {
    const op = setDistributionPreset(preset);
    if (op.type !== "setting.set") throw new Error("narrow");
    expect(op.payload.row.key).toBe(distributionKey("p1"));
    expect(parseDistributionPreset(op.payload.row.value)).toEqual(preset);
  });

  it("names (or clears) the default", () => {
    const op = setDefaultDistribution("p1");
    if (op.type !== "setting.set") throw new Error("narrow");
    expect(op.payload.row).toEqual({ key: DISTRIBUTION_DEFAULT_KEY, value: "p1" });
    const cleared = setDefaultDistribution(null);
    if (cleared.type !== "setting.set") throw new Error("narrow");
    expect(cleared.payload.row.value).toBe("");
  });
});

it("a plain createTransaction still writes an undistributed row", () => {
  const op = createTransaction({ ...income });
  expect(op.payload.row.distribution_preset_id).toBeNull();
});
