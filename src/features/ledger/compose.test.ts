import { describe, it, expect } from "vitest";
import { composeOp, type ComposeDraft } from "@/features/ledger/compose";
import { makeCategory, makeContainer } from "@/core/model";

/**
 * The one implementation both writing surfaces share.
 *
 * The compose bar (desktop, inline above the register) and the quick-add sheet
 * (the FAB's sheet, §12.5's one orchestrated moment) ask the same question —
 * "does this draft make a transaction, and if not, what do I tell the user?" —
 * so they ask it here. Two copies of this would eventually disagree about the
 * soft sign rule (§5.4), and the one that disagreed would be the one writing to
 * the journal.
 */

const coffee = makeCategory({ id: "coffee", name: "Coffee", type: "expense" });
const salary = makeCategory({ id: "salary", name: "Salary", type: "income" });
const wallet = makeContainer({ id: "wallet", name: "Wallet" });
const savings = makeContainer({ id: "savings", name: "Savings" });

const entry = (over: Partial<Extract<ComposeDraft, { kind: "entry" }>> = {}) =>
  ({
    kind: "entry",
    date: "2026-07-22",
    vendor: "Blue Bottle",
    amountStr: "4.50",
    sign: "-",
    category: coffee,
    from: wallet,
    ...over,
  }) satisfies ComposeDraft;

const transfer = (over: Partial<Extract<ComposeDraft, { kind: "transfer" }>> = {}) =>
  ({
    kind: "transfer",
    date: "2026-07-22",
    vendor: "",
    amountStr: "300",
    from: wallet,
    to: savings,
    ...over,
  }) satisfies ComposeDraft;

describe("composeOp — an expense or income entry", () => {
  it("builds a signed transaction.create with the wallet and category", () => {
    const out = composeOp(entry());
    expect(out.status).toBe("ready");
    if (out.status !== "ready") return;
    expect(out.op.type).toBe("transaction.create");
    expect(out.row.id).toBe(out.op.payload.row.id);
    const row = out.op.payload.row;
    expect(row.amount).toBe(-450);
    expect(row.vendor_source).toBe("Blue Bottle");
    expect(row.category_id).toBe("coffee");
    expect(row.container_id).toBe("wallet");
    expect(row.date).toBe("2026-07-22");
    expect(out.toast).toEqual({
      title: "Logged",
      description: "Blue Bottle · -$4.50 · Wallet",
    });
  });

  it("takes the sign from the control, not from the category", () => {
    const out = composeOp(entry({ sign: "+", category: coffee }), { confirmed: true });
    expect(out.status).toBe("ready");
    if (out.status !== "ready") return;
    expect(out.op.payload.row.amount).toBe(450);
  });

  it("logs income as a positive row", () => {
    const out = composeOp(
      entry({ category: salary, sign: "+", vendor: "Paycheck", amountStr: "2140" }),
    );
    expect(out.status).toBe("ready");
    if (out.status !== "ready") return;
    expect(out.op.payload.row.amount).toBe(214000);
  });

  it("trims the payee", () => {
    const out = composeOp(entry({ vendor: "  Blue Bottle  " }));
    if (out.status !== "ready") throw new Error("expected ready");
    expect(out.op.payload.row.vendor_source).toBe("Blue Bottle");
  });

  it("keeps a caller-chosen instant, and otherwise stamps the op's own", () => {
    const chosen = composeOp(entry({ entered_at: "2026-07-22T18:04:11.000Z" }));
    if (chosen.status !== "ready") throw new Error("expected ready");
    expect(chosen.op.payload.row.entered_at).toBe("2026-07-22T18:04:11.000Z");

    const now = composeOp(entry());
    if (now.status !== "ready") throw new Error("expected ready");
    expect(now.op.payload.row.entered_at).toBe(now.op.ts);
  });
});

describe("composeOp — what it refuses, and how it says so", () => {
  it("asks for a payee before anything else about the amount", () => {
    expect(composeOp(entry({ vendor: "   ", amountStr: "nope" }))).toEqual({
      status: "error",
      message: "Add a payee or source.",
    });
  });

  it("asks for a category when there is none to file against", () => {
    expect(composeOp(entry({ category: undefined }))).toEqual({
      status: "error",
      message: "Add a category first.",
    });
  });

  it("asks for a container when the wallet is missing", () => {
    expect(composeOp(entry({ from: undefined }))).toEqual({
      status: "error",
      message: "Pick a container.",
    });
  });

  it("rejects an unparseable amount and a zero one, differently", () => {
    expect(composeOp(entry({ amountStr: "abc" }))).toEqual({
      status: "error",
      message: "Enter a valid amount.",
    });
    expect(composeOp(entry({ amountStr: "0" }))).toEqual({
      status: "error",
      message: "Amount can't be zero.",
    });
  });
});

describe("composeOp — the soft sign rule (§5.4): arm, then commit", () => {
  it("asks for confirmation when money comes IN on an expense category", () => {
    const out = composeOp(entry({ sign: "+" }));
    expect(out.status).toBe("confirm");
    if (out.status !== "confirm") return;
    expect(out.message).toBe(
      "$4.50 is money in on a expense category — looks like a refund or rebate. Add again to confirm.",
    );
  });

  it("asks for confirmation when money goes OUT on an income category", () => {
    const out = composeOp(entry({ category: salary, sign: "-" }));
    expect(out.status).toBe("confirm");
    if (out.status !== "confirm") return;
    expect(out.message).toContain("clawback");
  });

  it("commits the second time, unchanged — a warning guides, it never blocks", () => {
    const out = composeOp(entry({ sign: "+" }), { confirmed: true });
    expect(out.status).toBe("ready");
    if (out.status !== "ready") return;
    expect(out.op.payload.row.amount).toBe(450);
  });

  it("never asks about the usual direction", () => {
    expect(composeOp(entry()).status).toBe("ready");
    expect(composeOp(entry({ category: salary, sign: "+" })).status).toBe("ready");
  });
});

describe("composeOp — a transfer", () => {
  it("moves a positive magnitude out of one container into another", () => {
    const out = composeOp(transfer());
    expect(out.status).toBe("ready");
    if (out.status !== "ready") return;
    const row = out.op.payload.row;
    expect(row.amount).toBe(-30000); // one row, negative on the source (§5.4)
    expect(row.container_id).toBe("wallet");
    expect(row.to_container_id).toBe("savings");
    expect(row.category_id).toBeNull();
    expect(out.toast).toEqual({
      title: "Moved",
      description: "$300.00 · Wallet → Savings",
    });
  });

  it("takes the magnitude however the sign was typed — direction is the arrow", () => {
    const out = composeOp(transfer({ amountStr: "-300" }));
    if (out.status !== "ready") throw new Error("expected ready");
    expect(out.op.payload.row.amount).toBe(-30000);
  });

  it("carries an optional note as the row's description", () => {
    const out = composeOp(transfer({ vendor: "  rent pot  " }));
    if (out.status !== "ready") throw new Error("expected ready");
    expect(out.op.payload.row.vendor_source).toBe("rent pot");
  });

  it("needs both ends, and two different ones", () => {
    expect(composeOp(transfer({ to: undefined }))).toEqual({
      status: "error",
      message: "Pick where the money goes.",
    });
    expect(composeOp(transfer({ to: wallet }))).toEqual({
      status: "error",
      message: "Pick two different containers.",
    });
  });

  it("rejects a zero or unparseable amount", () => {
    expect(composeOp(transfer({ amountStr: "0" }))).toEqual({
      status: "error",
      message: "Amount can't be zero.",
    });
    expect(composeOp(transfer({ amountStr: "" }))).toEqual({
      status: "error",
      message: "Enter a valid amount.",
    });
  });

  it("never asks to confirm a sign — a transfer has no unusual direction", () => {
    expect(composeOp(transfer({ amountStr: "300" })).status).toBe("ready");
  });
});
