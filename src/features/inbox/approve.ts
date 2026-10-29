import {
  approveDistributed,
  approveTransaction,
  updateTransaction,
} from "@/core/commands";
import { isTransfer } from "@/core/engine/balances";
import { splitIncome, usablePreset } from "@/core/engine/distribution";
import {
  TransactionSchema,
  type Container,
  type DistributionPreset,
  type Transaction,
} from "@/core/model";
import type { Op } from "@/core/oplog";

/**
 * Approving one Inbox row (plans/income-distribution.md). An income occurrence
 * that carries a preset is split NOW, at the amount being approved. If the
 * preset can't split any more (archived, its rest container archived) or the
 * row isn't money in, it is approved whole into its own container — and the
 * stale preset is dropped, so the ledger never claims a split that didn't happen.
 */
export function approvalOps(
  row: Transaction,
  presets: DistributionPreset[],
  containers: Container[],
): Op[] {
  if (row.distribution_preset_id === null || isTransfer(row)) {
    return [approveTransaction(row.id)];
  }
  const preset = usablePreset(row.distribution_preset_id, presets, containers);
  const split = preset ? splitIncome(row.amount, preset, containers) : null;
  if (preset && split?.ok) return approveDistributed(row, preset.id, split);
  return [
    approveTransaction(row.id),
    updateTransaction(
      TransactionSchema.parse({
        ...row,
        inbox_status: "approved",
        distribution_preset_id: null,
      }),
    ),
  ];
}
