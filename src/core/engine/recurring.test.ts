import { describe, it, expect } from "vitest";
import {
  firstOccurrenceOnOrAfter,
  nextOccurrence,
  generateDueOccurrences,
  upcomingOccurrences,
} from "@/core/engine/recurring";
import { makeRecurringRule, type IntervalConfig } from "@/core/model";

function rule(
  frequency: Parameters<typeof makeRecurringRule>[0]["frequency"],
  interval_config: IntervalConfig,
  extra: Partial<Parameters<typeof makeRecurringRule>[0]> = {},
) {
  return makeRecurringRule({
    id: "r1",
    frequency,
    interval_config,
    template_vendor_source: "Netflix",
    template_container_id: "general",
    template_category_id: "c1",
    template_amount: -1500,
    start_date: "2026-01-01",
    ...extra,
  });
}

describe("occurrence math — firstOccurrenceOnOrAfter / nextOccurrence (§5.8)", () => {
  it("daily: every day", () => {
    const r = rule("daily", {});
    expect(firstOccurrenceOnOrAfter(r, "2026-03-10")).toBe("2026-03-10");
    expect(nextOccurrence(r, "2026-03-10")).toBe("2026-03-11");
    expect(nextOccurrence(r, "2026-02-28")).toBe("2026-03-01");
  });

  it("weekly: snaps forward to the wanted weekday, then +7", () => {
    // 2026-01-01 is a Thursday (getDay 4). Want Monday (1).
    const r = rule("weekly", { day_of_week: 1 });
    expect(firstOccurrenceOnOrAfter(r, "2026-01-01")).toBe("2026-01-05"); // next Monday
    expect(nextOccurrence(r, "2026-01-05")).toBe("2026-01-12");
    // Already on the wanted weekday → itself.
    expect(firstOccurrenceOnOrAfter(r, "2026-01-05")).toBe("2026-01-05");
  });

  it("monthly: anchors on day_of_month, clamping short months", () => {
    const r = rule("monthly", { day_of_month: 31 });
    expect(firstOccurrenceOnOrAfter(r, "2026-01-01")).toBe("2026-01-31");
    // Feb clamps to the 28th, then March recovers the 31st (anchor, not chained).
    expect(nextOccurrence(r, "2026-01-31")).toBe("2026-02-28");
    expect(nextOccurrence(r, "2026-02-28")).toBe("2026-03-31");
  });

  it("monthly: from a date past this month's anchor rolls to next month", () => {
    const r = rule("monthly", { day_of_month: 1 });
    expect(firstOccurrenceOnOrAfter(r, "2026-03-02")).toBe("2026-04-01");
    expect(firstOccurrenceOnOrAfter(r, "2026-03-01")).toBe("2026-03-01");
  });

  it("biweekly: twice a month on two anchor days, not every 14 days", () => {
    const r = rule("biweekly", { days_of_month: [1, 15] });
    expect(firstOccurrenceOnOrAfter(r, "2026-01-01")).toBe("2026-01-01");
    expect(nextOccurrence(r, "2026-01-01")).toBe("2026-01-15");
    expect(nextOccurrence(r, "2026-01-15")).toBe("2026-02-01");
    expect(firstOccurrenceOnOrAfter(r, "2026-01-10")).toBe("2026-01-15");
    expect(firstOccurrenceOnOrAfter(r, "2026-01-20")).toBe("2026-02-01");
  });

  it("annually: month/day each year, clamping Feb 29", () => {
    const r = rule("annually", { month: 2, day: 29 });
    // 2026 is not a leap year → Feb 28.
    expect(firstOccurrenceOnOrAfter(r, "2026-01-01")).toBe("2026-02-28");
    expect(nextOccurrence(r, "2026-02-28")).toBe("2027-02-28");
  });

  it("custom: strict cadence anchored on start_date", () => {
    const r = rule("custom", { every: 2, unit: "week" }, { start_date: "2026-01-01" });
    expect(firstOccurrenceOnOrAfter(r, "2026-01-01")).toBe("2026-01-01");
    expect(nextOccurrence(r, "2026-01-01")).toBe("2026-01-15");
    // From an off-grid date, snap forward to the next multiple.
    expect(firstOccurrenceOnOrAfter(r, "2026-01-10")).toBe("2026-01-15");
    const monthly = rule("custom", { every: 3, unit: "month" }, { start_date: "2026-01-31" });
    expect(nextOccurrence(monthly, "2026-01-31")).toBe("2026-04-30"); // date-fns clamps
  });
});

describe("generateDueOccurrences — fixed backfills every missed month oldest-first (§5.8)", () => {
  it("one pending row per missed occurrence, each at its own due date", () => {
    const r = rule("monthly", { day_of_month: 1 }, { start_date: "2026-01-01" });
    const { rows, rule: advanced } = generateDueOccurrences(r, "2026-04-15");
    expect(rows.map((t) => t.date)).toEqual([
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
      "2026-04-01",
    ]);
    expect(rows.every((t) => t.inbox_status === "pending")).toBe(true);
    expect(rows.every((t) => t.recurring_rule_id === "r1")).toBe(true);
    expect(rows.every((t) => t.amount === -1500)).toBe(true);
    // Cursor advanced past everything generated → next open generates nothing.
    expect(advanced.next_generation_date).toBe("2026-05-01");
    expect(generateDueOccurrences(advanced, "2026-04-20").rows).toEqual([]);
  });

  it("occurrence ids are deterministic by (rule, date) → regen never duplicates", () => {
    const r = rule("monthly", { day_of_month: 1 });
    const a = generateDueOccurrences(r, "2026-03-15");
    const b = generateDueOccurrences(r, "2026-03-15"); // same cursor, run twice
    expect(a.rows.map((t) => t.id)).toEqual(b.rows.map((t) => t.id));
    expect(a.rows[0].id).toBe("r1:2026-01-01");
  });

  it("respects end_date — stops generating past it", () => {
    const r = rule("monthly", { day_of_month: 1 }, { end_date: "2026-02-28" });
    const { rows } = generateDueOccurrences(r, "2026-06-01");
    expect(rows.map((t) => t.date)).toEqual(["2026-01-01", "2026-02-01"]);
  });

  it("generates nothing when nothing is due yet", () => {
    const r = rule("monthly", { day_of_month: 1 }, { start_date: "2026-05-01" });
    expect(generateDueOccurrences(r, "2026-03-15").rows).toEqual([]);
  });
});

describe("generateDueOccurrences — goal_derived collapses to one current occurrence (§5.8)", () => {
  it("a single row dated today, never one per missed month", () => {
    const r = rule("monthly", { day_of_month: 1 }, { amount_mode: "goal_derived" });
    const { rows, rule: advanced } = generateDueOccurrences(r, "2026-04-15");
    expect(rows).toHaveLength(1);
    expect(rows[0].date).toBe("2026-04-15");
    expect(rows[0].inbox_status).toBe("pending");
    // Cursor still advances past ALL missed occurrences (no re-catch-up).
    expect(advanced.next_generation_date).toBe("2026-05-01");
  });
});

describe("generateDueOccurrences — goal_derived uses the resolved required_monthly (§5.9.5)", () => {
  const goalRule = makeRecurringRule({
    id: "gr",
    frequency: "monthly",
    interval_config: { day_of_month: 1 },
    template_vendor_source: "to House",
    template_container_id: "general",
    template_category_id: null,
    template_to_container_id: "house",
    amount_mode: "goal_derived",
    linked_goal_id: "g1",
    template_amount: null,
    start_date: "2026-01-01",
  });

  it("logs one transfer at the passed-in amount (not the stale template)", () => {
    const { rows } = generateDueOccurrences(goalRule, "2026-04-15", {
      goalDerivedAmount: 4000,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].date).toBe("2026-04-15");
    expect(rows[0].amount).toBe(-4000); // transfer stored negative on the source
    expect(rows[0].to_container_id).toBe("house");
    expect(rows[0].inbox_status).toBe("pending");
  });

  it("a $0 required (goal reached / done) stops generating, but the cursor advances", () => {
    const { rows, rule: advanced } = generateDueOccurrences(goalRule, "2026-04-15", {
      goalDerivedAmount: 0,
    });
    expect(rows).toEqual([]);
    expect(advanced.next_generation_date).toBe("2026-05-01");
  });
});

describe("generateDueOccurrences — transfer rule generates a pending transfer", () => {
  it("negative row on the source, destination via to_container_id", () => {
    const r = makeRecurringRule({
      id: "r2",
      frequency: "monthly",
      interval_config: { day_of_month: 1 },
      template_vendor_source: "to savings",
      template_container_id: "general",
      template_category_id: null,
      template_to_container_id: "savings",
      template_amount: 20000,
      start_date: "2026-01-01",
    });
    const { rows } = generateDueOccurrences(r, "2026-02-15");
    expect(rows).toHaveLength(2);
    expect(rows[0].category_id).toBeNull();
    expect(rows[0].to_container_id).toBe("savings");
    expect(rows[0].amount).toBe(-20000); // stored negative on the source
    expect(rows[0].inbox_status).toBe("pending");
  });
});

describe("generateDueOccurrences — a cancelled rule is inert", () => {
  it("generates nothing while cancelled", () => {
    const r = rule("daily", {}, { status: "cancelled" });
    expect(generateDueOccurrences(r, "2027-01-01").rows).toEqual([]);
  });
});

// ── M11: what is coming, without generating anything ─────────────────────────
describe("upcomingOccurrences — the commitments ahead of you (M11)", () => {
  const rent = rule(
    "monthly",
    { day_of_month: 25 },
    { id: "rent", template_vendor_source: "Rent", template_amount: -185000 },
  );
  const gym = rule(
    "monthly",
    { day_of_month: 1 },
    { id: "gym", template_vendor_source: "Gym", template_amount: -4500 },
  );

  it("walks each rule's grid inside the window, earliest first", () => {
    expect(upcomingOccurrences([rent, gym], "2026-07-22", "2026-08-21")).toEqual([
      { rule: rent, date: "2026-07-25", amount: -185000 },
      { rule: gym, date: "2026-08-01", amount: -4500 },
    ]);
  });

  it("is inclusive of both ends", () => {
    expect(
      upcomingOccurrences([rent], "2026-07-25", "2026-07-25").map((o) => o.date),
    ).toEqual(["2026-07-25"]);
    expect(upcomingOccurrences([rent], "2026-07-26", "2026-08-24")).toEqual([]);
  });

  it("says nothing about a paused rule or one that has already ended", () => {
    const paused = rule("monthly", { day_of_month: 25 }, { status: "cancelled" });
    const ended = rule(
      "monthly",
      { day_of_month: 25 },
      { id: "ended", end_date: "2026-07-24" },
    );
    expect(upcomingOccurrences([paused, ended], "2026-07-22", "2026-08-21")).toEqual([]);
  });

  it("ignores a rule that has not started yet", () => {
    const future = rule(
      "monthly",
      { day_of_month: 25 },
      { id: "future", start_date: "2026-09-01" },
    );
    expect(upcomingOccurrences([future], "2026-07-22", "2026-08-21")).toEqual([]);
  });

  it("lists every occurrence a frequent rule owes, capped by the limit", () => {
    const coffee = rule("daily", {}, { id: "coffee", template_amount: -450 });
    expect(upcomingOccurrences([coffee], "2026-07-22", "2026-07-31")).toHaveLength(10);
    expect(
      upcomingOccurrences([coffee], "2026-07-22", "2026-07-31", { limit: 3 }),
    ).toHaveLength(3);
  });

  it("carries no amount for a goal-derived rule that has none stored", () => {
    const goalRule = rule(
      "monthly",
      { day_of_month: 25 },
      { id: "goal", amount_mode: "goal_derived", template_amount: null },
    );
    expect(
      upcomingOccurrences([goalRule], "2026-07-22", "2026-08-21")[0].amount,
    ).toBeNull();
  });

  it("orders same-day occurrences by name then id, so two devices agree (§8.5)", () => {
    const zzz = rule(
      "monthly",
      { day_of_month: 25 },
      { id: "a", template_vendor_source: "Zzz" },
    );
    const aaa = rule(
      "monthly",
      { day_of_month: 25 },
      { id: "b", template_vendor_source: "Aaa" },
    );
    expect(
      upcomingOccurrences([zzz, aaa], "2026-07-22", "2026-07-26").map((o) => o.rule.id),
    ).toEqual(["b", "a"]);
  });
});
