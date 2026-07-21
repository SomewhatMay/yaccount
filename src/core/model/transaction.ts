import { z } from "zod";
import { zId, zIsoDate, zYearMonth, zCents, newId, yearMonthOf } from "./primitives";

/** §5.4 transactions — unified ledger (expense/income, transfer, template, pending). */
export const InboxStatusSchema = z.enum(["pending", "approved"]);
export type InboxStatus = z.infer<typeof InboxStatusSchema>;

export const TransactionSchema = z.object({
  id: zId,
  date: zIsoDate,
  // Signed integer cents: negative = outflow, positive = inflow. Sign is a UI
  // default only — NOT coupled to category type here (§5.4 / §10.13), so voids,
  // reversals, and refunds can legitimately carry the opposite sign.
  amount: zCents,
  vendor_source: z.string().min(1), // for transfers: synthesized "{src} → {dest}", editable
  category_id: zId.nullable(), // null only for transfers
  container_id: zId, // source container / the account
  to_container_id: zId.nullable(), // set only for transfers — destination
  is_template: z.boolean(), // true = saved shortcut, not a live ledger entry
  template_name: z.string().nullable(),
  inbox_status: InboxStatusSchema, // 'pending' rows excluded from all derivations
  recurring_rule_id: zId.nullable(),
  notes: z.string().nullable(),
  // Void mechanism (M2, design decision — spec §5.4 has no correction field, §10 #24):
  // set ONLY on a reversing row → the id of the transaction it cancels. Both rows
  // remain in the ledger (append-only §0.3), balance stays exact; "X is voided" is
  // derived as "some row has reverses_id === X.id". Null for ordinary rows.
  reverses_id: zId.nullable(),
  yearMonth: zYearMonth, // STORED, derived from `date` at write time (§8.3)
});
export type Transaction = z.infer<typeof TransactionSchema>;

/**
 * Build an expense/income transaction (§5.4 shape: `category_id` set,
 * `to_container_id` null). Signed integer cents — sign is the caller's (the UI
 * pre-signs by category type, §10 #13). `yearMonth` is derived from `date` here
 * so the compound indexes can key on it (§8.3).
 */
export function makeTransaction(input: {
  date: string;
  amount: number; // signed cents
  vendor_source: string;
  category_id: string;
  id?: string;
  container_id?: string; // defaults to the caller-supplied general wallet
  inbox_status?: InboxStatus;
  notes?: string | null;
}): Transaction {
  return TransactionSchema.parse({
    id: input.id ?? newId(),
    date: input.date,
    amount: input.amount,
    vendor_source: input.vendor_source,
    category_id: input.category_id,
    container_id: input.container_id ?? "general",
    to_container_id: null,
    is_template: false,
    template_name: null,
    inbox_status: input.inbox_status ?? "approved",
    recurring_rule_id: null,
    notes: input.notes ?? null,
    reverses_id: null,
    yearMonth: yearMonthOf(input.date),
  });
}

/**
 * Build the reversing row that voids `original` (§0.3 — never a destructive
 * delete). Same fields, opposite-sign `amount`, `reverses_id` → the original's
 * id. Dated `on` (defaults to the original's date) so it lands in a sensible
 * period; balance nets to zero across the pair.
 */
export function makeVoidRow(
  original: Transaction,
  opts?: { id?: string; on?: string },
): Transaction {
  const date = opts?.on ?? original.date;
  return TransactionSchema.parse({
    ...original,
    id: opts?.id ?? newId(),
    date,
    amount: original.amount === 0 ? 0 : -original.amount,
    reverses_id: original.id,
    yearMonth: yearMonthOf(date),
  });
}
