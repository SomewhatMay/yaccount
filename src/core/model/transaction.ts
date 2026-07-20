import { z } from "zod";
import { zId, zIsoDate, zYearMonth, zCents } from "./primitives";

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
  yearMonth: zYearMonth, // STORED, derived from `date` at write time (§8.3)
});
export type Transaction = z.infer<typeof TransactionSchema>;
