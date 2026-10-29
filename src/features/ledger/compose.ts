import {
  createDistributedIncome,
  createTransaction,
  createTransfer,
} from "@/core/commands";
import { splitIncome } from "@/core/engine/distribution";
import { formatCents, parseDollars } from "@/core/money";
import type { Category, Container, DistributionPreset, Transaction } from "@/core/model";
import type { Op, TransactionCreateOp } from "@/core/oplog";
import { resolveAmount, type Sign } from "@/features/ledger/amount";

/**
 * Turning a half-filled form into one op — the single implementation behind both
 * writing surfaces.
 *
 * The compose bar sits inline above the register (§12.4); the quick-add sheet
 * rises from the FAB on any screen (§12.5). They look nothing alike and they ask
 * exactly the same question, so they ask it here. Two copies would eventually
 * disagree about the soft sign rule (§5.4) — and the copy that disagreed would
 * be the one writing to the journal.
 *
 * Pure: no React, no clock, no dispatch. The caller owns the state, shows the
 * message and decides what "confirmed" means in its own UI.
 */

export type ComposeDraft =
  | {
      kind: "entry";
      date: string;
      /** The instant the entry happened; omitted means "stamp it from the op". */
      entered_at?: string;
      vendor: string;
      notes?: string;
      amountStr: string;
      sign: Sign;
      category?: Category;
      from?: Container;
      /** Split this income by a preset (plans/income-distribution.md) instead of
       * landing it whole in `from`. `containers` decides which parts can still
       * receive money (archived ones fold into rest). */
      distribution?: { preset: DistributionPreset; containers: Container[] };
    }
  | {
      kind: "transfer";
      date: string;
      entered_at?: string;
      /** An optional note; blank falls back to "{source} → {destination}". */
      vendor: string;
      notes?: string;
      amountStr: string;
      from?: Container;
      to?: Container;
    };

export type ComposeOutcome =
  /** Nothing was built. Say this, keep what was typed. */
  | { status: "error"; message: string }
  /** Buildable, but unusual (§5.4) — show this and let the next submit commit. */
  | { status: "confirm"; message: string }
  | {
      status: "ready";
      /** The entry's own row op (for a split: the income). */
      op: TransactionCreateOp;
      /** Everything to commit, as one batch — `[op]`, or the income plus its
       * pieces for a distributed income. */
      ops: Op[];
      /** The row about to be written, so the register can wash it as it lands
       * (§12.5) without re-deriving what was just built. */
      row: Transaction;
      toast: { title: string; description: string };
    };

export function composeOp(
  draft: ComposeDraft,
  opts: { confirmed?: boolean } = {},
): ComposeOutcome {
  const err = (message: string): ComposeOutcome => ({ status: "error", message });

  // Both shapes need somewhere for the money to come from — a distributed
  // income's comes from its preset.
  if (!draft.from && !(draft.kind === "entry" && draft.distribution)) {
    return err("Pick a container.");
  }

  if (draft.kind === "transfer") {
    const { from, to } = draft;
    if (!from) return err("Pick a container.");
    if (!to) return err("Pick where the money goes.");
    if (from.id === to.id) return err("Pick two different containers.");

    let magnitude: number;
    try {
      // A transfer's direction is the arrow, not the sign, so however it was
      // typed we move a magnitude.
      magnitude = Math.abs(parseDollars(draft.amountStr));
    } catch {
      return err("Enter a valid amount.");
    }
    if (magnitude === 0) return err("Amount can't be zero.");

    const op = createTransfer({
      date: draft.date,
      entered_at: draft.entered_at,
      amount: magnitude,
      container_id: from.id,
      to_container_id: to.id,
      fromName: from.name,
      toName: to.name,
      vendor_source: draft.vendor.trim() || undefined,
      notes: draft.notes?.trim() || null,
    });
    return {
      status: "ready",
      op,
      ops: [op],
      row: op.payload.row,
      toast: {
        title: "Moved",
        description: `${formatCents(magnitude)} · ${from.name} → ${to.name}`,
      },
    };
  }

  const { from, category } = draft;
  const vendor = draft.vendor.trim();
  if (!vendor) return err("Add a payee or source.");
  if (!category) return err("Add a category first.");

  const res = resolveAmount(draft.amountStr, category.type, draft.sign);
  if (!res.ok) return err(res.error);

  if (draft.distribution) {
    if (category.type !== "income" || res.signed <= 0) {
      return err("Only money in can be distributed.");
    }
    return composeDistributed(draft, vendor, category, res.signed, draft.distribution);
  }
  if (!from) return err("Pick a container.");

  // Money in on an expense category (or out on income) is legal — a refund, a
  // rebate, a clawback — so it is flagged inline and never blocked (§10 #13).
  if (res.unusual && !opts.confirmed) {
    return {
      status: "confirm",
      message: `${formatCents(res.signed)} is money ${draft.sign === "+" ? "in" : "out"} on a ${category.type} category — looks like a ${
        category.type === "expense" ? "refund or rebate" : "clawback"
      }. Add again to confirm.`,
    };
  }

  const op = createTransaction({
    date: draft.date,
    entered_at: draft.entered_at,
    amount: res.signed,
    vendor_source: vendor,
    category_id: category.id,
    container_id: from.id,
    notes: draft.notes?.trim() || null,
  });
  return {
    status: "ready",
    op,
    ops: [op],
    row: op.payload.row,
    toast: {
      title: "Logged",
      description: `${vendor} · ${formatCents(res.signed)} · ${from.name}`,
    },
  };
}

function composeDistributed(
  draft: Extract<ComposeDraft, { kind: "entry" }>,
  vendor: string,
  category: Category,
  amount: number,
  { preset, containers }: { preset: DistributionPreset; containers: Container[] },
): ComposeOutcome {
  const split = splitIncome(amount, preset, containers);
  if (!split.ok) {
    const rest =
      containers.find((c) => c.id === preset.rest_container_id)?.name ??
      "Its rest container";
    return {
      status: "error",
      message:
        split.reason === "preset-archived"
          ? `${preset.name} is archived — pick a container instead.`
          : `${rest} is archived, so ${preset.name} can't split right now — pick a container instead.`,
    };
  }
  const ops = createDistributedIncome({
    date: draft.date,
    entered_at: draft.entered_at,
    amount,
    vendor_source: vendor,
    category_id: category.id,
    notes: draft.notes?.trim() || null,
    preset_id: preset.id,
    split,
  });
  const op = ops[0] as TransactionCreateOp;
  const ways = split.pieces.length + 1;
  const restName =
    containers.find((c) => c.id === split.rest.container_id)?.name ?? "rest";
  return {
    status: "ready",
    op,
    ops,
    row: op.payload.row,
    toast: {
      title: "Logged",
      description: `${vendor} · ${formatCents(amount)} · ${
        ways > 1 ? `split ${ways} ways` : restName
      }`,
    },
  };
}
