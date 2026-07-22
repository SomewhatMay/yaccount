import type { Transaction } from "../model";
import { isLiveLedgerRow } from "./balances";

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
  // Only a reversal that actually moves money can cancel anything: a pending or
  // template "void" is not a live ledger row (§10 #2/#3), so hiding its target
  // would take a row off screen whose amount the balance still counts.
  const reversers = new Map<string, Transaction[]>();
  for (const t of txns) {
    if (!t.reverses_id || !isLiveLedgerRow(t)) continue;
    const list = reversers.get(t.reverses_id) ?? [];
    list.push(t);
    reversers.set(t.reverses_id, list);
  }

  // Rows on a `reverses_id` cycle are malformed (the app can only ever point at
  // an older row). Resolve them FIRST, as hidden, so the answer never depends on
  // which row the walk happened to start from — two devices must agree on what
  // is on screen (§1.1 rule 2, §8.5).
  const cyclic = new Set<string>();
  const state = new Map<string, 0 | 1 | 2>(); // 0 unvisited, 1 on stack, 2 done
  const byId = new Map(txns.map((t) => [t.id, t]));
  for (const t of txns) {
    const stack: string[] = [];
    const walk = (id: string): void => {
      const s = state.get(id) ?? 0;
      if (s === 2) return;
      if (s === 1) {
        for (const onPath of stack.slice(stack.indexOf(id))) cyclic.add(onPath);
        return;
      }
      state.set(id, 1);
      stack.push(id);
      const next = byId.get(id)?.reverses_id;
      if (next && byId.has(next)) walk(next);
      stack.pop();
      state.set(id, 2);
    };
    walk(t.id);
  }

  // A row is cancelled iff SOME live row reverses it — a chain walk, since a
  // reversal can itself be reversed (delete → undo → redo, §1.1).
  const memo = new Map<string, boolean>();
  function isLive(t: Transaction): boolean {
    if (cyclic.has(t.id)) return false;
    const cached = memo.get(t.id);
    if (cached !== undefined) return cached;
    memo.set(t.id, false); // provisional; cycles are already excluded above
    const cancelled = (reversers.get(t.id) ?? []).some((r) => isLive(r));
    memo.set(t.id, !cancelled);
    return !cancelled;
  }

  const live = new Set<string>();
  for (const t of txns) if (isLive(t)) live.add(t.id);
  return live;
}

/** True if `id` has been deleted and not undone. */
export function isVoided(txns: Transaction[], id: string): boolean {
  const row = txns.find((t) => t.id === id);
  return row ? !liveIds(txns).has(id) : false;
}

/**
 * The rows a register should show: live, approved, non-template, and not
 * themselves a reversal (a reversal is bookkeeping for the pair it cancels, not
 * an event the user logged). Pending rows (§5.8) are excluded — they live in the
 * Inbox until approved, never in the register or any derivation. Order is the
 * caller's business.
 */
export function activeRows(txns: Transaction[]): Transaction[] {
  const live = liveIds(txns);
  return txns.filter(
    (t) =>
      !t.is_template && t.inbox_status === "approved" && !t.reverses_id && live.has(t.id),
  );
}

/**
 * The Inbox queue (§5.8): pending, non-template rows the user hasn't acted on.
 * A dismissed occurrence is voided (a reversing row points at it), so any row
 * carrying a reversal is excluded — the proposal has been withdrawn. Approving a
 * row moves it out of this list (its `inbox_status` becomes 'approved') and into
 * the register.
 */
export function pendingRows(txns: Transaction[]): Transaction[] {
  const reversed = new Set(
    txns.filter((t) => t.reverses_id).map((t) => t.reverses_id as string),
  );
  return txns.filter(
    (t) =>
      t.inbox_status === "pending" &&
      !t.is_template &&
      !t.reverses_id &&
      !reversed.has(t.id),
  );
}

/** Every non-template shortcut the user has saved (§5.8). */
export function templateRows(txns: Transaction[]): Transaction[] {
  return txns.filter((t) => t.is_template);
}
