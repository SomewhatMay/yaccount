import type { Transaction } from "../model";

/**
 * Which ledger rows are live right now, resolving void chains (§5.4 + §0.3).
 *
 * A "delete" appends a reversing row (`reverses_id` → its target); undoing that
 * delete appends a row reversing the *reversing* row, and so on. So a row is
 * cancelled only by a reversal that is itself still live — walk each chain from
 * its end:
 *
 *   t1                       → live
 *   t1 ← v1                  → both hidden (deleted)
 *   t1 ← v1 ← u1             → t1 live again (undo)
 *   t1 ← v1 ← u1, t1 ← v2    → hidden again (redo)
 *
 * Balance never depends on this — every reversal is a real signed amount, so the
 * arithmetic nets out on its own (§0.4). This is presentation only.
 */
function liveIds(txns: Transaction[]): Set<string> {
  const reversers = new Map<string, Transaction[]>();
  for (const t of txns) {
    if (!t.reverses_id) continue;
    const list = reversers.get(t.reverses_id) ?? [];
    list.push(t);
    reversers.set(t.reverses_id, list);
  }

  const live = new Set<string>();
  const memo = new Map<string, boolean>();

  // A row is cancelled iff SOME live row reverses it. Recurse on the chain;
  // chains are short and acyclic (a reversal always names an existing row).
  function isLive(t: Transaction, seen: Set<string>): boolean {
    const cached = memo.get(t.id);
    if (cached !== undefined) return cached;
    if (seen.has(t.id)) return true; // defensive: never loop on malformed data
    seen.add(t.id);
    const cancelled = (reversers.get(t.id) ?? []).some((r) => isLive(r, seen));
    memo.set(t.id, !cancelled);
    return !cancelled;
  }

  for (const t of txns) if (isLive(t, new Set())) live.add(t.id);
  return live;
}

/** True if `id` has been deleted and not undone. */
export function isVoided(txns: Transaction[], id: string): boolean {
  const row = txns.find((t) => t.id === id);
  return row ? !liveIds(txns).has(id) : false;
}

/**
 * The rows a register should show: live, non-template, and not themselves a
 * reversal (a reversal is bookkeeping for the pair it cancels, not an event the
 * user logged). Order is the caller's business.
 */
export function activeRows(txns: Transaction[]): Transaction[] {
  const live = liveIds(txns);
  return txns.filter((t) => !t.is_template && !t.reverses_id && live.has(t.id));
}
