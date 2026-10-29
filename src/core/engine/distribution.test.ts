import { describe, it, expect } from "vitest";
import {
  DISTRIBUTION_DEFAULT_KEY,
  distributionKey,
  makeContainer,
  makeDistributionPreset,
  makeRecurringRule,
  makeSetting,
  makeTransaction,
  makeTransfer,
  makeVoidRow,
  serializeDistributionPreset,
  type Container,
  type DistributionPreset,
  type Transaction,
} from "@/core/model";
import {
  defaultPresetId,
  distributionPieces,
  filterRegister,
  fillFromGoalAsks,
  groupBreakdown,
  hideDistributionPieces,
  listPresets,
  presetIssues,
  recallDistribution,
  recurringOverlap,
  splitIncome,
  usablePreset,
} from "@/core/engine/distribution";
import { activeRows } from "@/core/engine/ledger";

const containers: Container[] = [
  { ...makeContainer({ id: "general", name: "General" }) },
  makeContainer({ id: "savings", name: "Savings" }),
  makeContainer({ id: "invest", name: "Invest", is_investment: true }),
];

const paycheck = (over: Partial<DistributionPreset> = {}): DistributionPreset =>
  makeDistributionPreset({
    id: "p1",
    name: "Paycheck",
    rest_container_id: "general",
    parts: [
      { container_id: "savings", bps: 2000 },
      { container_id: "invest", bps: 3300 },
    ],
    ...over,
  });

describe("splitIncome — exact cents, rest takes the remainder", () => {
  it("splits a round amount with no rounding", () => {
    const split = splitIncome(300000, paycheck(), containers);
    expect(split.ok).toBe(true);
    if (!split.ok) return;
    expect(split.rest).toEqual({ container_id: "general", amount: 141000 });
    expect(split.pieces).toEqual([
      { container_id: "savings", bps: 2000, amount: 60000 },
      { container_id: "invest", bps: 3300, amount: 99000 },
    ]);
    expect(split.folded).toEqual([]);
  });

  it("floors every part and hands every leftover cent to rest — parts + rest = amount", () => {
    // 33.33% × 3 of $100.00 = 3333.3 each → floors to 3333; rest gets 1¢ + its own 0.01%.
    const p = paycheck({
      parts: [
        { container_id: "savings", bps: 3333 },
        { container_id: "invest", bps: 3333 },
      ],
    });
    for (const amount of [1, 7, 99, 10000, 10001, 123457, 999999999]) {
      const split = splitIncome(amount, p, containers);
      expect(split.ok).toBe(true);
      if (!split.ok) continue;
      const total = split.rest.amount + split.pieces.reduce((s, x) => s + x.amount, 0);
      expect(total).toBe(amount);
      for (const piece of split.pieces) {
        expect(Number.isInteger(piece.amount)).toBe(true);
        expect(piece.amount).toBe(Math.floor((amount * piece.bps) / 10000));
      }
    }
  });

  it("stays exact at amounts where float multiplication would drift", () => {
    const p = paycheck({ parts: [{ container_id: "savings", bps: 9999 }] });
    const amount = Number.MAX_SAFE_INTEGER;
    const split = splitIncome(amount, p, containers);
    expect(split.ok).toBe(true);
    if (!split.ok) return;
    const expected = (BigInt(amount) * 9999n) / 10000n;
    expect(BigInt(split.pieces[0].amount)).toBe(expected);
    expect(BigInt(split.rest.amount) + expected).toBe(BigInt(amount));
  });

  it("drops a part that floors to 0¢ — a transfer of nothing is not a row", () => {
    const split = splitIncome(3, paycheck(), containers);
    expect(split.ok).toBe(true);
    if (!split.ok) return;
    // 20% of 3¢ = 0.6 → 0; 33% → 0.99 → 0. Everything stays in rest.
    expect(split.pieces).toEqual([]);
    expect(split.rest.amount).toBe(3);
  });

  it("gives rest only the rounding cents when the parts total 100%", () => {
    const p = paycheck({
      parts: [
        { container_id: "savings", bps: 5000 },
        { container_id: "invest", bps: 5000 },
      ],
    });
    const split = splitIncome(10001, p, containers);
    expect(split.ok && split.rest.amount).toBe(1);
  });

  it("folds a part at an archived container into rest, and says so", () => {
    const withArchived = containers.map((c) =>
      c.id === "invest" ? { ...c, is_archived: true } : c,
    );
    const split = splitIncome(300000, paycheck(), withArchived);
    expect(split.ok).toBe(true);
    if (!split.ok) return;
    expect(split.pieces.map((p) => p.container_id)).toEqual(["savings"]);
    expect(split.rest.amount).toBe(240000);
    expect(split.folded).toEqual(["invest"]);
  });

  it("folds a part whose container no longer exists", () => {
    const split = splitIncome(
      100000,
      paycheck({ parts: [{ container_id: "ghost", bps: 5000 }] }),
      containers,
    );
    expect(split.ok && split.folded).toEqual(["ghost"]);
    expect(split.ok && split.rest.amount).toBe(100000);
  });

  it("refuses when the rest container is archived or missing", () => {
    const archivedRest = containers.map((c) =>
      c.id === "general" ? { ...c, is_archived: true } : c,
    );
    expect(splitIncome(100, paycheck(), archivedRest)).toEqual({
      ok: false,
      reason: "rest-unavailable",
    });
    expect(
      splitIncome(100, paycheck({ rest_container_id: "ghost" }), containers),
    ).toEqual({
      ok: false,
      reason: "rest-unavailable",
    });
  });

  it("refuses money out and zero — only money in is distributed", () => {
    expect(splitIncome(0, paycheck(), containers)).toEqual({
      ok: false,
      reason: "not-income",
    });
    expect(splitIncome(-500, paycheck(), containers)).toEqual({
      ok: false,
      reason: "not-income",
    });
    expect(splitIncome(1.5, paycheck(), containers)).toEqual({
      ok: false,
      reason: "not-income",
    });
  });

  it("refuses an archived preset", () => {
    expect(splitIncome(100, paycheck({ archived: true }), containers)).toEqual({
      ok: false,
      reason: "preset-archived",
    });
  });
});

describe("presets in settings", () => {
  const settings = [
    makeSetting(distributionKey("p1"), serializeDistributionPreset(paycheck())),
    makeSetting(
      distributionKey("p2"),
      serializeDistributionPreset(paycheck({ id: "p2", name: "windfall", parts: [] })),
    ),
    makeSetting(
      distributionKey("p3"),
      serializeDistributionPreset(
        paycheck({ id: "p3", name: "Archived", archived: true }),
      ),
    ),
    makeSetting(distributionKey("bad"), "{nope"),
    makeSetting("default_container_id", "general"),
  ];

  it("lists every parseable preset by name, ignoring junk and other settings", () => {
    expect(listPresets(settings).map((p) => p.id)).toEqual(["p3", "p1", "p2"]);
  });

  it("names the default only while that preset is active", () => {
    expect(
      defaultPresetId([...settings, makeSetting(DISTRIBUTION_DEFAULT_KEY, "p2")]),
    ).toBe("p2");
    expect(
      defaultPresetId([...settings, makeSetting(DISTRIBUTION_DEFAULT_KEY, "p3")]),
    ).toBe(null);
    expect(
      defaultPresetId([...settings, makeSetting(DISTRIBUTION_DEFAULT_KEY, "")]),
    ).toBe(null);
    expect(defaultPresetId(settings)).toBe(null);
  });

  it("usablePreset resolves an id to an active preset with a usable rest", () => {
    expect(usablePreset("p1", listPresets(settings), containers)?.id).toBe("p1");
    expect(usablePreset("p3", listPresets(settings), containers)).toBeNull();
    expect(usablePreset("nope", listPresets(settings), containers)).toBeNull();
    expect(usablePreset(null, listPresets(settings), containers)).toBeNull();
    const archivedRest = containers.map((c) =>
      c.id === "general" ? { ...c, is_archived: true } : c,
    );
    expect(usablePreset("p1", listPresets(settings), archivedRest)).toBeNull();
  });
});

describe("presetIssues", () => {
  it("names archived and missing parts, and an unusable rest", () => {
    const list = containers.map((c) =>
      c.id === "invest" ? { ...c, is_archived: true } : c,
    );
    expect(
      presetIssues(
        paycheck({ parts: [...paycheck().parts, { container_id: "x", bps: 1 }] }),
        list,
      ),
    ).toEqual({ foldedParts: ["invest", "x"], restUnavailable: false });
    expect(presetIssues(paycheck({ rest_container_id: "x" }), containers)).toEqual({
      foldedParts: [],
      restUnavailable: true,
    });
  });
});

const income = (
  id: string,
  over: Partial<Parameters<typeof makeTransaction>[0]> = {},
): Transaction =>
  makeTransaction({
    id,
    date: "2026-10-01",
    amount: 300000,
    vendor_source: "Paycheck",
    category_id: "salary",
    entered_at: "2026-10-01T09:00:00.000Z",
    ...over,
  });

const piece = (parentId: string, to: string, amount: number, id?: string): Transaction =>
  makeTransfer({
    id: id ?? `${parentId}:split:${to}`,
    date: "2026-10-01",
    amount,
    container_id: "general",
    to_container_id: to,
    vendor_source: "Paycheck",
    distribution_parent_id: parentId,
    entered_at: "2026-10-01T09:00:00.000Z",
  });

describe("recallDistribution — the last income in a category decides", () => {
  const presets = [paycheck(), paycheck({ id: "p2", name: "Windfall", parts: [] })];

  it("recalls the preset the category's last income used", () => {
    const txns = [
      income("a", { date: "2026-09-01", distribution_preset_id: "p2" }),
      income("b", { date: "2026-10-01", distribution_preset_id: "p1" }),
    ];
    expect(recallDistribution(txns, "salary", presets, containers, "p2")).toBe("p1");
  });

  it("recalls 'not distributed' when the last income went to one container", () => {
    const txns = [
      income("a", { date: "2026-09-01", distribution_preset_id: "p1" }),
      income("b", { date: "2026-10-01" }),
    ];
    expect(recallDistribution(txns, "salary", presets, containers, "p1")).toBeNull();
  });

  it("falls back to the default when the category has no income yet", () => {
    expect(recallDistribution([], "salary", presets, containers, "p2")).toBe("p2");
    expect(recallDistribution([], "salary", presets, containers, null)).toBeNull();
  });

  it("ignores deleted, pending, template, money-out and other-category rows", () => {
    const deleted = income("d", { date: "2026-10-05" });
    const txns = [
      income("a", { date: "2026-09-01", distribution_preset_id: "p1" }),
      deleted,
      makeVoidRow(deleted),
      income("p", { date: "2026-10-06", inbox_status: "pending" }),
      income("o", { date: "2026-10-07", amount: -100 }),
      income("g", { date: "2026-10-08", category_id: "gifts" }),
    ];
    expect(recallDistribution(txns, "salary", presets, containers, null)).toBe("p1");
  });

  it("falls back to undistributed when the recalled preset is archived or gone", () => {
    const txns = [income("a", { distribution_preset_id: "gone" })];
    expect(recallDistribution(txns, "salary", presets, containers, "p2")).toBeNull();
  });
});

describe("grouping live pieces under a live parent", () => {
  it("collects the live pieces of each live parent", () => {
    const rows = activeRows([
      income("pay", { distribution_preset_id: "p1" }),
      piece("pay", "savings", 60000),
      piece("pay", "invest", 99000),
    ]);
    const pieces = distributionPieces(rows);
    expect(pieces.get("pay")?.map((p) => p.to_container_id)).toEqual([
      "savings",
      "invest",
    ]);
  });

  it("hides pieces from the register only while their parent is live", () => {
    const parent = income("pay", { distribution_preset_id: "p1" });
    const s = piece("pay", "savings", 60000);
    const shown = hideDistributionPieces(activeRows([parent, s]));
    expect(shown.map((t) => t.id)).toEqual(["pay"]);

    // Parent voided (e.g. by an older client that doesn't know about groups):
    // the piece is real money that still moved, so it shows as a plain transfer.
    const orphaned = hideDistributionPieces(activeRows([parent, makeVoidRow(parent), s]));
    expect(orphaned.map((t) => t.id)).toEqual([s.id]);

    // Parent not synced yet: same.
    expect(hideDistributionPieces(activeRows([s])).map((t) => t.id)).toEqual([s.id]);
  });

  it("drops a voided piece from its group", () => {
    const s = piece("pay", "savings", 60000);
    const rows = activeRows([income("pay"), s, makeVoidRow(s)]);
    expect(distributionPieces(rows).get("pay")).toBeUndefined();
  });
});

describe("groupBreakdown — read from the rows, never the preset", () => {
  it("lists each piece, largest first, then the rest, with shares of the gross", () => {
    const parent = income("pay", { distribution_preset_id: "p1" });
    const lines = groupBreakdown(parent, [
      piece("pay", "savings", 60000),
      piece("pay", "invest", 99000),
    ]);
    expect(lines).toEqual([
      { container_id: "invest", amount: 99000, share: 0.33, rest: false },
      { container_id: "savings", amount: 60000, share: 0.2, rest: false },
      { container_id: "general", amount: 141000, share: 0.47, rest: true },
    ]);
  });

  it("shows a drifted group honestly — rest is whatever is actually left", () => {
    const parent = income("pay", { amount: 100000, distribution_preset_id: "p1" });
    const lines = groupBreakdown(parent, [piece("pay", "savings", 150000)]);
    expect(lines.at(-1)).toEqual({
      container_id: "general",
      amount: -50000,
      share: -0.5,
      rest: true,
    });
  });

  it("sums pieces that landed in the same container twice (concurrent writers)", () => {
    const parent = income("pay");
    const lines = groupBreakdown(parent, [
      piece("pay", "savings", 100, "a"),
      piece("pay", "savings", 200, "b"),
    ]);
    expect(lines[0]).toMatchObject({ container_id: "savings", amount: 300 });
  });
});

describe("fillFromGoalAsks", () => {
  it("turns each goal container's ask into a share of expected income", () => {
    const result = fillFromGoalAsks({
      income: 300000,
      restContainerId: "general",
      asks: [
        { containerId: "savings", amount: 45000 },
        { containerId: "savings", amount: 15000 },
        { containerId: "invest", amount: 30000 },
      ],
    });
    expect(result).toEqual({
      ok: true,
      parts: [
        { container_id: "savings", bps: 2000 },
        { container_id: "invest", bps: 1000 },
      ],
    });
  });

  it("skips asks into the rest container and zero asks", () => {
    const result = fillFromGoalAsks({
      income: 100000,
      restContainerId: "general",
      asks: [
        { containerId: "general", amount: 5000 },
        { containerId: "savings", amount: 0 },
      ],
    });
    expect(result).toEqual({ ok: true, parts: [] });
  });

  it("refuses without expected income, or when asks exceed it", () => {
    expect(fillFromGoalAsks({ income: 0, restContainerId: "general", asks: [] })).toEqual(
      { ok: false, reason: "no-income" },
    );
    expect(
      fillFromGoalAsks({
        income: 1000,
        restContainerId: "general",
        asks: [{ containerId: "savings", amount: 2000 }],
      }),
    ).toEqual({ ok: false, reason: "over-income" });
  });

  it("never rounds a non-zero ask down to 0%", () => {
    const result = fillFromGoalAsks({
      income: 100000000,
      restContainerId: "general",
      asks: [{ containerId: "savings", amount: 1 }],
    });
    expect(result).toEqual({ ok: true, parts: [{ container_id: "savings", bps: 1 }] });
  });
});

describe("recurringOverlap", () => {
  it("names active recurring transfers into a preset's part containers", () => {
    const rules = [
      makeRecurringRule({
        id: "r1",
        frequency: "monthly",
        interval_config: { day_of_month: 1 },
        template_vendor_source: "Auto-save",
        template_container_id: "general",
        template_to_container_id: "savings",
        template_category_id: null,
        template_amount: 20000,
        start_date: "2026-01-01",
      }),
      makeRecurringRule({
        id: "r2",
        frequency: "monthly",
        interval_config: { day_of_month: 1 },
        template_vendor_source: "Old",
        template_container_id: "general",
        template_to_container_id: "invest",
        template_category_id: null,
        template_amount: 100,
        start_date: "2026-01-01",
        status: "cancelled",
      }),
    ];
    const overlap = recurringOverlap(rules, ["savings", "invest"]);
    expect([...overlap.keys()]).toEqual(["savings"]);
    expect(overlap.get("savings")?.map((r) => r.id)).toEqual(["r1"]);
  });
});

describe("filterRegister — a piece can surface its parent", () => {
  const parent = income("pay", { distribution_preset_id: "p1" });
  const live = activeRows([
    parent,
    piece("pay", "savings", 60000),
    piece("pay", "invest", 99000),
    income("other", {
      vendor_source: "Gift",
      category_id: "gifts",
      container_id: "savings",
    }),
  ]);
  const names: Record<string, string> = {
    general: "General",
    savings: "Savings",
    invest: "Invest",
  };
  const label = (t: Transaction) =>
    `${names[t.container_id] ?? ""} ${t.to_container_id ? names[t.to_container_id] : ""}`;

  it("shows every parent compactly when nothing filters", () => {
    const out = filterRegister(live, {}, { label });
    expect(out.rows.map((r) => r.id)).toEqual(["pay", "other"]);
    expect(out.highlights.size).toBe(0);
  });

  it("a container filter on a part shows the parent with that line lit", () => {
    const out = filterRegister(live, { containerIds: ["savings"] }, { label });
    expect(out.rows.map((r) => r.id)).toEqual(["pay", "other"]);
    expect([...(out.highlights.get("pay") ?? [])]).toEqual(["savings"]);
  });

  it("a container filter on the rest container lights the rest line", () => {
    const out = filterRegister(live, { containerIds: ["general"] }, { label });
    expect(out.rows.map((r) => r.id)).toEqual(["pay"]);
    expect([...(out.highlights.get("pay") ?? [])]).toEqual(["general"]);
  });

  it("lights both when the filter names rest and a part", () => {
    const out = filterRegister(live, { containerIds: ["general", "invest"] }, { label });
    expect([...(out.highlights.get("pay") ?? [])].sort()).toEqual(["general", "invest"]);
  });

  it("a search for a part's container surfaces the parent", () => {
    const out = filterRegister(live, { text: "invest" }, { label });
    expect(out.rows.map((r) => r.id)).toEqual(["pay"]);
    expect([...(out.highlights.get("pay") ?? [])]).toEqual(["invest"]);
  });

  it("a search the parent matches on its own keeps it compact", () => {
    const out = filterRegister(live, { text: "paycheck" }, { label });
    expect(out.rows.map((r) => r.id)).toEqual(["pay"]);
    expect(out.highlights.size).toBe(0);
  });

  it("a transfer-kind filter surfaces the split by its pieces", () => {
    const out = filterRegister(live, { kinds: ["transfer"] }, { label });
    expect(out.rows.map((r) => r.id)).toEqual(["pay"]);
    expect([...(out.highlights.get("pay") ?? [])].sort()).toEqual(["invest", "savings"]);
  });

  it("an amount filter can match a piece's size", () => {
    const out = filterRegister(live, { minAmount: 90000, maxAmount: 100000 }, { label });
    expect([...(out.highlights.get("pay") ?? [])]).toEqual(["invest"]);
  });
});
