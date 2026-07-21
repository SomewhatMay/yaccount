import type { Transaction } from "../model";

/** Rows that count toward live balance: approved AND non-template (§0.4/§5.4). */
export function isLiveLedgerRow(t: Transaction): boolean {
  return t.inbox_status === "approved" && !t.is_template;
}

/**
 * The §0.4 balance identity — NOT a naive `SUM(amount)`:
 *
 *   balance(c) = SUM(amount WHERE container_id = c)
 *              − SUM(amount WHERE to_container_id = c)
 *   over rows WHERE inbox_status = 'approved' AND is_template = false
 *
 * A transfer is a *single* negative row keyed to the source `container_id`; the
 * destination is credited only via the second term (`amount` is negative → the
 * subtraction adds). Transfers arrive with the UI in M3, but the identity is
 * honored from M2 so nothing downstream has to change.
 */
export function containerBalance(txns: Transaction[], containerId: string): number {
  let balance = 0;
  for (const t of txns) {
    if (!isLiveLedgerRow(t)) continue;
    if (t.container_id === containerId) balance += t.amount;
    if (t.to_container_id === containerId) balance -= t.amount;
  }
  return balance;
}
