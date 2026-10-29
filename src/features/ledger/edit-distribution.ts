import { reconcileDistribution, updateTransaction, type OpMeta } from "@/core/commands";
import {
  distributionPieces,
  splitIncome,
  usablePreset,
} from "@/core/engine/distribution";
import { activeRows } from "@/core/engine/ledger";
import {
  TransactionSchema,
  type Container,
  type DistributionPreset,
  type Transaction,
} from "@/core/model";
import type { Op } from "@/core/oplog";

/**
 * What saving an edited expense/income writes, distribution included
 * (plans/income-distribution.md). Pure: the edit sheet hands over the row as
 * edited plus the Distribute controls, and gets back one batch or an error.
 *
 * - A pending occurrence only records the preset (and lands in its rest) —
 *   Approve writes the pieces, at the approved amount.
 * - A split re-splits only when what it depends on changed (amount, a newly
 *   picked preset, or Distribute newly ticked); otherwise every piece keeps its
 *   cents and just follows the row's date, payee and container.
 * - Distribute only applies to money in on an income category. Anything else
 *   drops the split rather than asking the user to untick a box that isn't
 *   on screen.
 */
export function needsResplit(input: {
  tx: Transaction;
  amount: number;
  distribute: boolean;
  moneyIn: boolean;
  wasDistributed: boolean;
  presetId: string | null;
}): boolean {
  if (!input.distribute || !input.moneyIn || input.tx.inbox_status === "pending")
    return false;
  return (
    !input.wasDistributed ||
    input.amount !== input.tx.amount ||
    (input.presetId !== null && input.presetId !== input.tx.distribution_preset_id)
  );
}

export function editOps(
  input: {
    /** The row as stored. */
    tx: Transaction;
    /** The row as edited — signed amount, picked container, etc. */
    next: Transaction;
    /** Money in on an income category — the only thing that can be split. */
    moneyIn: boolean;
    distribute: boolean;
    presetId: string | null;
  },
  ctx: {
    presets: DistributionPreset[];
    containers: Container[];
    transactions: Transaction[];
  },
  m?: OpMeta,
): { ok: true; ops: Op[] } | { ok: false; error: string } {
  const { tx, next, moneyIn } = input;
  const distribute = input.distribute && moneyIn;
  const preset = usablePreset(input.presetId, ctx.presets, ctx.containers);
  const ownPieces = distributionPieces(activeRows(ctx.transactions)).get(tx.id) ?? [];
  const wasDistributed = tx.distribution_preset_id !== null || ownPieces.length > 0;
  const pick = { ok: false as const, error: "Pick a distribution to split this income." };

  if (tx.inbox_status === "pending") {
    if (distribute && !preset) return pick;
    const row = distribute
      ? {
          ...next,
          container_id: preset!.rest_container_id,
          distribution_preset_id: preset!.id,
        }
      : { ...next, distribution_preset_id: null };
    return { ok: true, ops: [updateTransaction(TransactionSchema.parse(row), m)] };
  }

  if (!distribute && !wasDistributed) {
    return {
      ok: true,
      ops: [
        updateTransaction(
          TransactionSchema.parse({ ...next, distribution_preset_id: null }),
          m,
        ),
      ],
    };
  }

  const reconcile = (
    parent: Transaction,
    desired: { container_id: string; amount: number }[],
  ) =>
    reconcileDistribution(
      { parent, livePieces: ownPieces, desired, allTxns: ctx.transactions },
      m,
    );

  if (!distribute) {
    return { ok: true, ops: reconcile({ ...next, distribution_preset_id: null }, []) };
  }

  if (
    needsResplit({
      tx,
      amount: next.amount,
      distribute,
      moneyIn,
      wasDistributed,
      presetId: input.presetId,
    })
  ) {
    if (!preset) return pick;
    const split = splitIncome(next.amount, preset, ctx.containers);
    if (!split.ok) return pick;
    return {
      ok: true,
      ops: reconcile(
        {
          ...next,
          container_id: split.rest.container_id,
          distribution_preset_id: preset.id,
        },
        split.pieces,
      ),
    };
  }

  // Same amount, same preset: every piece keeps its cents; the rest stays put.
  return {
    ok: true,
    ops: reconcile(
      { ...next, container_id: tx.container_id },
      ownPieces.map((p) => ({
        container_id: p.to_container_id!,
        amount: Math.abs(p.amount),
      })),
    ),
  };
}
