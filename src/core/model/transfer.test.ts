import { describe, it, expect } from "vitest";
import { makeTransfer, transferLabel } from "./transaction";
import { makeContainerSnapshot } from "./containerSnapshot";

describe("makeTransfer — the transfer shape (§5.4)", () => {
  const base = {
    date: "2026-07-20",
    amount: 10000, // magnitude in cents — the caller never signs a transfer
    container_id: "general",
    to_container_id: "vacation",
    fromName: "General",
    toName: "Vacation",
  };

  it("stores a single negative row keyed to the source container", () => {
    const t = makeTransfer(base);
    expect(t.amount).toBe(-10000); // outflow on the source (§10 #5)
    expect(t.container_id).toBe("general");
    expect(t.to_container_id).toBe("vacation");
  });

  it("has no category — transfers are excluded from category dashboards", () => {
    expect(makeTransfer(base).category_id).toBeNull();
  });

  it("synthesizes vendor_source as '{source} → {dest}' (§5.4, NOT NULL holds)", () => {
    expect(makeTransfer(base).vendor_source).toBe("General → Vacation");
    expect(transferLabel("General", "Vacation")).toBe("General → Vacation");
  });

  it("keeps a user-supplied vendor_source over the synthesized label", () => {
    expect(makeTransfer({ ...base, vendor_source: "Payday sweep" }).vendor_source).toBe(
      "Payday sweep",
    );
  });

  it("derives the stored yearMonth from the date (§8.3)", () => {
    expect(makeTransfer(base).yearMonth).toBe("2026-07");
  });

  it("is a live ledger row by default, never a template", () => {
    const t = makeTransfer(base);
    expect(t.inbox_status).toBe("approved");
    expect(t.is_template).toBe(false);
    expect(t.reverses_id).toBeNull();
  });

  it("rejects a transfer to the same container", () => {
    expect(() => makeTransfer({ ...base, to_container_id: "general" })).toThrow();
  });

  it("rejects a zero or negative magnitude", () => {
    expect(() => makeTransfer({ ...base, amount: 0 })).toThrow();
    expect(() => makeTransfer({ ...base, amount: -500 })).toThrow();
  });

  it("requires either container names or an explicit vendor_source", () => {
    expect(() =>
      makeTransfer({
        date: base.date,
        amount: base.amount,
        container_id: base.container_id,
        to_container_id: base.to_container_id,
      }),
    ).toThrow();
  });
});

describe("makeContainerSnapshot — reported real-world value (§5.6)", () => {
  it("builds a snapshot row in integer cents", () => {
    const s = makeContainerSnapshot({
      id: "s1",
      container_id: "brokerage",
      date: "2026-07-20",
      reported_balance: 1234567,
    });
    expect(s).toEqual({
      id: "s1",
      container_id: "brokerage",
      date: "2026-07-20",
      reported_balance: 1234567,
    });
  });

  it("mints an id when none is given and rejects a non-integer balance", () => {
    const s = makeContainerSnapshot({
      container_id: "brokerage",
      date: "2026-07-20",
      reported_balance: 0,
    });
    expect(s.id.length).toBeGreaterThan(0);
    expect(() =>
      makeContainerSnapshot({
        container_id: "brokerage",
        date: "2026-07-20",
        reported_balance: 10.5,
      }),
    ).toThrow();
  });
});
