import type { Transaction } from "../model";
import { isLiveLedgerRow } from "./balances";
import { matchesFilter } from "./filter";

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
function liveIds(
  txns: Transaction[],
  // Which rows may act as reversers. For the ledger, only a live (approved,
  // non-template) reversal can cancel anything — a pending/template "void" is not
  // a live ledger row (§10 #2/#3). The Inbox passes its own predicate so that a
  // pending dismissal (and its undo) resolve within the pending world.
  isReverser: (t: Transaction) => boolean = isLiveLedgerRow,
): Set<string> {
  const reversers = new Map<string, Transaction[]>();
  for (const t of txns) {
    if (!t.reverses_id || !isReverser(t)) continue;
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
 * A dismissal appends a pending reversing row; undoing it appends a row reversing
 * THAT (dismiss → undo → redo), so liveness is a chain walk, not a one-step "is
 * reversed" check (§0.3) — otherwise an undone dismiss would never reappear.
 * Pending reversals are what count here (a dismiss copies the occurrence's
 * pending status). Approving a row moves it out of this list.
 */
export function pendingRows(txns: Transaction[]): Transaction[] {
  const live = liveIds(txns, (t) => t.inbox_status === "pending");
  return txns.filter(
    (t) =>
      t.inbox_status === "pending" && !t.is_template && !t.reverses_id && live.has(t.id),
  );
}

/** Every non-template shortcut the user has saved (§5.8). */
export function templateRows(txns: Transaction[]): Transaction[] {
  return txns.filter((t) => t.is_template);
}

/**
 * Free-text lookup over the register — what the ⌘K palette searches (M11).
 *
 * The matching itself is `matchesFilter`'s text half, so the palette narrows a
 * payee by exactly the rule the ledger's filter rail uses — a search that finds a
 * row the rail beside it hides would be two answers to one question.
 *
 * What is local to a palette: a blank query returns nothing (nothing typed is not
 * "everything" — the palette shows destinations instead), and `limit` caps what
 * there is room to show. Order is the caller's; pass rows already in register
 * order.
 */
export function searchTransactions(
  txns: Transaction[],
  query: string,
  opts: { limit?: number; label?: (t: Transaction) => string } = {},
): Transaction[] {
  if (query.trim() === "") return [];
  const limit = opts.limit ?? 8;
  const found: Transaction[] = [];
  for (const t of txns) {
    if (found.length >= limit) break;
    if (matchesFilter(t, { text: query }, { label: opts.label })) found.push(t);
  }
  return found;
}

/**
 * Register order: newest first (§12.4 date-grouped rows).
 *
 * `date` alone can't do this. It is the calendar day the money moved — the user
 * picks it and may backdate it — so everything logged this afternoon shares one
 * value, and the old tie-break on `id` (a random UUID) scattered a burst of
 * entries arbitrarily. `entered_at` is the instant the row was written, taken
 * from the authoring op, so it puts the most recent entry on top.
 *
 * A row with no instant predates M11 (or came from an older client): it sinks to
 * the end of its day, since it is the oldest thing we can say about that day. The
 * `id` tie-break stays last so two devices always agree on the same order (§8.5).
 * Returns a new array — the caller's is untouched.
 */
export function sortForRegister(txns: Transaction[]): Transaction[] {
  return [...txns].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    // "" for a missing instant sorts below every real ISO timestamp.
    const ae = a.entered_at ?? "";
    const be = b.entered_at ?? "";
    if (ae !== be) return ae < be ? 1 : -1;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
}

/** The orders the register offers (§12.4 M11 filter rail). */
export const REGISTER_SORTS = ["newest", "oldest", "largest", "smallest"] as const;
export type RegisterSort = (typeof REGISTER_SORTS)[number];

/** Whether a stored preference is one this build still knows how to render. */
export function isRegisterSort(value: string): value is RegisterSort {
  return (REGISTER_SORTS as readonly string[]).includes(value);
}

/**
 * The register in the order the reader asked for.
 *
 * `oldest` is the register order reversed — literally the inverse comparator, so
 * the two can never drift apart. `largest`/`smallest` rank by the SIZE of an
 * entry, not its signed amount: a $2,140 paycheck is a big entry, and ranking by
 * sign would file every expense below every income and answer a question nobody
 * asked. Ties fall back to register order (the sort is stable over an
 * already-ordered array), so two devices always agree (§8.5).
 */
export function sortRegister(
  txns: Transaction[],
  order: RegisterSort = "newest",
): Transaction[] {
  const register = sortForRegister(txns);
  if (order === "newest") return register;
  if (order === "oldest") return register.reverse();
  const sign = order === "largest" ? 1 : -1;
  return register.sort((a, b) => sign * (Math.abs(b.amount) - Math.abs(a.amount)));
}
