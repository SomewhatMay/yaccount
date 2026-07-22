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

/** The containers the headline figure is allowed to count (§5.7). */
function countedIds(containers: Container[]): Set<string> {
  const ids = new Set<string>();
  for (const c of containers) {
    if (c.include_in_overall_balance && !c.is_archived) ids.add(c.id);
  }
  return ids;
}

/**
 * What one row does to the overall balance: the §0.4 identity summed across the
 * counted set instead of evaluated per container. A transfer between two counted
 * containers cancels itself out — it is your own money moving, not a change in
 * how much you have.
 */
function overallDelta(t: Transaction, counted: Set<string>): number {
  let delta = 0;
  if (counted.has(t.container_id)) delta += t.amount;
  if (t.to_container_id !== null && counted.has(t.to_container_id)) delta -= t.amount;
  return delta;
}

/**
 * The overall balance as it stood at the end of `iso` (M11).
 *
 * The same §5.7 rule as `overallBalance`, wound back to a day — what a paper
 * check register carries down the page. Reversals are counted like any other row,
 * so a deleted entry stands in the running balance until the day its reversal is
 * dated: the register shows the correction where it happened rather than
 * retroactively rewriting the days before it (§0.3).
 */
export function overallBalanceAsOf(
  txns: Transaction[],
  containers: Container[],
  iso: string,
): number {
  const counted = countedIds(containers);
  let total = 0;
  for (const t of txns) {
    if (!isLiveLedgerRow(t) || t.date > iso) continue;
    total += overallDelta(t, counted);
  }
  return total;
}

/**
 * The overall balance on each of `days` — the trailing series the hero figure
 * stands on (§12.7 signature #1).
 *
 * One ordered pass rather than a full scan per day: the deltas are sorted once
 * and consumed as the days advance. Days are walked in ascending order INTERNALLY
 * and the answers mapped back to the order asked for, so a caller handing them
 * over unsorted gets right numbers instead of a silently wrong curve.
 */
export function overallBalanceSeries(
  txns: Transaction[],
  containers: Container[],
  days: string[],
): number[] {
  const counted = countedIds(containers);
  const deltas = txns
    .filter(isLiveLedgerRow)
    .map((t) => ({ date: t.date, delta: overallDelta(t, counted) }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const order = days.map((_, i) => i).sort((a, b) => (days[a] < days[b] ? -1 : 1));
  const out = new Array<number>(days.length);
  let running = 0;
  let next = 0;
  for (const i of order) {
    while (next < deltas.length && deltas[next].date <= days[i]) {
      running += deltas[next].delta;
      next += 1;
    }
    out[i] = running;
  }
  return out;
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
