import type { Container, Transaction } from "../model";

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

/** The transfer shape (§5.4): no category, a destination container. */
export function isTransfer(t: Transaction): boolean {
  return t.category_id === null && t.to_container_id !== null;
}

/**
 * "Current Overall Balance" (§5.7) — the opt-in headline metric:
 *
 *   SUM(containers.balance WHERE include_in_overall_balance = true)
 *
 * Default is EXCLUDE: money being saved toward something must not silently
 * inflate "you have $X to spend". Only `general` ships opted in. Archived
 * containers drop out too — one the user has put away must not sit invisibly in
 * the headline figure (its own balance is still queryable via containerBalance).
 */
export function overallBalance(txns: Transaction[], containers: Container[]): number {
  let total = 0;
  for (const c of containers) {
    if (!c.include_in_overall_balance || c.is_archived) continue;
    total += containerBalance(txns, c.id);
  }
  return total;
}

/**
 * Net Contributions (§5.6) — transfers IN minus transfers OUT for a container.
 * The general savings-progress primitive: it counts only money the user moved
 * into the pool, so spending *from* the pool (an expense row) does not reduce it
 * (§5.9.3) and market growth never appears. Pending transfers are excluded —
 * approval is what moves money (§10 #3).
 */
export function netContributions(txns: Transaction[], containerId: string): number {
  let total = 0;
  for (const t of txns) {
    if (!isLiveLedgerRow(t) || !isTransfer(t)) continue;
    if (t.container_id === containerId) total += t.amount; // outflow (negative)
    if (t.to_container_id === containerId) total -= t.amount; // inflow
  }
  return total;
}
