import { describe, it, expect } from "vitest";
import { makeContainer, makeDistributionPreset } from "@/core/model";
import {
  draftFromPreset,
  emptyDraft,
  evaluateDraft,
  type PresetDraft,
} from "./distribution-draft";

const containers = [
  makeContainer({ id: "general", name: "General" }),
  makeContainer({ id: "savings", name: "Savings" }),
  makeContainer({ id: "invest", name: "Invest" }),
  { ...makeContainer({ id: "old", name: "Old" }), is_archived: true },
];
const existing = makeDistributionPreset({
  id: "p1",
  name: "Paycheck",
  rest_container_id: "general",
  parts: [{ container_id: "savings", bps: 2000 }],
});

const draft = (over: Partial<PresetDraft> = {}): PresetDraft => ({
  name: "Windfall",
  restId: "general",
  parts: [
    { containerId: "savings", pct: "20" },
    { containerId: "invest", pct: "33" },
  ],
  isDefault: false,
  ...over,
});

const ctx = { presets: [existing], editingId: null, containers, previewCents: 300000 };

describe("evaluateDraft", () => {
  it("builds a preset and a live preview when the draft is valid", () => {
    const out = evaluateDraft(draft(), ctx);
    expect(out.errors).toEqual({ parts: {} });
    expect(out.totalBps).toBe(5300);
    expect(out.restBps).toBe(4700);
    expect(out.preset).toMatchObject({
      name: "Windfall",
      rest_container_id: "general",
      parts: [
        { container_id: "savings", bps: 2000 },
        { container_id: "invest", bps: 3300 },
      ],
      archived: false,
    });
    expect(out.preview?.lines.map((l) => l.amount)).toEqual([60000, 99000, 141000]);
  });

  it("keeps the id of the preset being edited", () => {
    const out = evaluateDraft(draftFromPreset(existing, true), {
      ...ctx,
      editingId: "p1",
    });
    expect(out.preset?.id).toBe("p1");
  });

  it("flags over 100% with how far over, and builds nothing", () => {
    const out = evaluateDraft(
      draft({
        parts: [
          { containerId: "savings", pct: "60" },
          { containerId: "invest", pct: "45.5" },
        ],
      }),
      ctx,
    );
    expect(out.errors.total).toBe("Over 100% by 5.5%.");
    expect(out.preset).toBeNull();
  });

  it("names a bad share on its own row", () => {
    const out = evaluateDraft(
      draft({ parts: [{ containerId: "savings", pct: "abc" }] }),
      ctx,
    );
    expect(out.errors.parts.savings).toMatch(/percent/);
    expect(out.preset).toBeNull();
  });

  it("requires a unique name (ignoring case), but lets a preset keep its own", () => {
    expect(evaluateDraft(draft({ name: "  " }), ctx).errors.name).toBe("Name it.");
    expect(evaluateDraft(draft({ name: "paycheck" }), ctx).errors.name).toBe(
      "A distribution called Paycheck already exists.",
    );
    expect(
      evaluateDraft(draft({ name: "Paycheck" }), { ...ctx, editingId: "p1" }).errors.name,
    ).toBeUndefined();
  });

  it("refuses an archived rest container", () => {
    const out = evaluateDraft(draft({ restId: "old" }), ctx);
    expect(out.errors.rest).toBe("Old is archived — pick where the rest goes.");
    expect(out.preset).toBeNull();
  });

  it("flags (but allows) a part at an archived container", () => {
    const out = evaluateDraft(draft({ parts: [{ containerId: "old", pct: "10" }] }), ctx);
    expect(out.warnings).toEqual(["Old is archived — its share stays in General."]);
    expect(out.preset).not.toBeNull();
  });

  it("drops a part that is the rest container (the rest takes it anyway)", () => {
    const out = evaluateDraft(
      draft({ parts: [{ containerId: "general", pct: "10" }] }),
      ctx,
    );
    expect(out.preset?.parts).toEqual([]);
  });

  it("skips the preview without an amount", () => {
    expect(evaluateDraft(draft(), { ...ctx, previewCents: 0 }).preview).toBeNull();
  });

  it("starts empty with the rest in the given container", () => {
    expect(emptyDraft("general")).toEqual({
      name: "",
      restId: "general",
      parts: [],
      isDefault: false,
    });
  });

  it("round-trips a stored preset's shares as typed", () => {
    const p = makeDistributionPreset({
      name: "X",
      rest_container_id: "general",
      parts: [{ container_id: "savings", bps: 1250 }],
    });
    expect(draftFromPreset(p, false).parts).toEqual([
      { containerId: "savings", pct: "12.5" },
    ]);
  });
});
