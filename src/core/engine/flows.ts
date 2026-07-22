import type { Container, ContainerSnapshot, Transaction } from "../model";
import { isLiveLedgerRow, isTransfer, netContributions } from "./balances";
import { inRange, type DateRange } from "./period";

/**
 * Container Flows + investment/asset reporting (§5.4, §5.6). Deferred here from
 * M3 because Container Flows needs the reporting-period control (§6.1). All three
 * functions count **transfers only** — money moving between owned containers — and
 * credit both directions of the single-row transfer (in via `to_container_id`, out
 * via `container_id`, §0.4/§10 #4), never a one-sided `SUM(amount)`.
 */

export interface ContainerFlow {
  containerId: string;
  name: string;
  inflow: number; // cents moved in
  outflow: number; // cents moved out (positive magnitude)
  net: number; // inflow − outflow
}

/**
 * Net transfer inflow/outflow per non-archived container over the window (§5.4).
 * A transfer is a single negative row on its source container; the destination is
 * credited via `to_container_id`. Non-transfer rows (expenses/income) never appear
 * — nothing left the user's possession.
 */
export function containerFlows(
  txns: Transaction[],
  containers: Container[],
  range: DateRange,
): ContainerFlow[] {
  const transfers = txns.filter(
    (t) => isLiveLedgerRow(t) && isTransfer(t) && inRange(t.date, range),
  );
  return containers
    .filter((c) => !c.is_archived)
    .map((c) => {
      let inflow = 0;
      let outflow = 0;
      for (const t of transfers) {
        const mag = -t.amount; // stored negative on the source → positive magnitude
        if (t.to_container_id === c.id) inflow += mag;
        if (t.container_id === c.id) outflow += mag;
      }
      return { containerId: c.id, name: c.name, inflow, outflow, net: inflow - outflow };
    });
}

/** The latest snapshot for a container (max `date`), or null if never reported. */
function latestSnapshot(
  snapshots: ContainerSnapshot[],
  containerId: string,
): ContainerSnapshot | null {
  let best: ContainerSnapshot | null = null;
  for (const s of snapshots) {
    if (s.container_id !== containerId) continue;
    if (!best || s.date > best.date) best = s;
  }
  return best;
}

/**
 * Unrealized Gain/Loss (§5.6) = Current Value − Net Contributions, where Current
 * Value is the latest reported snapshot and Net Contributions is money actually
 * transferred in minus out (market growth is never a transaction). Null when the
 * container has no snapshot to value it against.
 */
export function unrealizedGainLoss(
  containerId: string,
  snapshots: ContainerSnapshot[],
  txns: Transaction[],
): number | null {
  const snap = latestSnapshot(snapshots, containerId);
  if (!snap) return null;
  return snap.reported_balance - netContributions(txns, containerId);
}

/** The change a container's balance sees from transfers dated in `(after, upto]`. */
function transferDelta(
  txns: Transaction[],
  containerId: string,
  after: string,
  upto: string,
): number {
  let delta = 0;
  for (const t of txns) {
    if (!isLiveLedgerRow(t) || !isTransfer(t)) continue;
    if (!(t.date > after && t.date <= upto)) continue;
    if (t.container_id === containerId) delta += t.amount; // outflow (negative)
    if (t.to_container_id === containerId) delta -= t.amount; // inflow
  }
  return delta;
}

/**
 * Reconstructed Balance Engine (§5.6, locked) — the historical gap-filler for
 * charts: `nearest known snapshot ± transfers in the gap to the target date`,
 * chosen over carry-forward (which ignores transfers between snapshots and draws
 * false cliff jumps). The nearest snapshot on-or-before the target is rolled
 * FORWARD by later transfers; if the only snapshots are after the target, the
 * earliest is rolled BACKWARD across the gap. Transfers are credited
 * two-directionally (§10 #4). Null when the container has never been snapshotted.
 */
export function reconstructedBalance(
  containerId: string,
  snapshots: ContainerSnapshot[],
  txns: Transaction[],
  targetDate: string,
): number | null {
  const own = snapshots
    .filter((s) => s.container_id === containerId)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (own.length === 0) return null;

  // Prefer the latest snapshot at or before the target (roll forward); otherwise
  // the earliest snapshot after it (roll backward).
  let base: ContainerSnapshot | undefined;
  for (const s of own) if (s.date <= targetDate) base = s;
  if (!base) base = own[0];

  if (base.date <= targetDate) {
    return (
      base.reported_balance + transferDelta(txns, containerId, base.date, targetDate)
    );
  }
  // base is after the target — subtract the gap's transfers to walk back.
  return base.reported_balance - transferDelta(txns, containerId, targetDate, base.date);
}
