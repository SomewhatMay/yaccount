import { addMonths, format } from "date-fns";
import type { Goal, Transaction } from "../model";
import { containerBalance, isLiveLedgerRow, isTransfer } from "./balances";

/**
 * Goal derivations (§5.9.7). All pure and clock-free — `today` is passed in — so
 * the engine stays testable in `core`. Nothing here is stored: `contributed`,
 * `progress`, and `required_monthly` are computed on demand from the ledger and
 * the goal row (impl §0.2).
 *
 * The load-bearing idea (§5.9.1): a goal's progress tracks cumulative *net
 * contributions*, never spendable balance — so spending on the goal's own purpose
 * (an expense out of its container) never re-inflates the ask. Only Transfers move
 * progress. The lone exception is a `reserve` goal, which deliberately measures
 * against live balance (a set-point, §5.9.3).
 */

type ISO = string;

function ym(iso: ISO): { y: number; m: number } {
  const [y, m] = iso.split("-").map(Number);
  return { y, m };
}

/**
 * Whole months from `from` through `deadline`, current month inclusive (§5.9.4) —
 * the divisor of the self-correcting ask. `≤ 0` means we are at or past the
 * deadline month (the caller must guard against ÷0, §5.9.7).
 */
export function wholeMonthsUntil(from: ISO, deadline: ISO): number {
  const a = ym(from);
  const b = ym(deadline);
  return (b.y - a.y) * 12 + (b.m - a.m) + 1;
}

/**
 * `contributed` (§5.9.7, spend_down): `opening_contributed` plus net Transfers
 * into the container since `created_date`. Transfers only — an expense out of the
 * container is spending on purpose, not an un-contribution (§5.9.3). Approved-only:
 * a pending contribution moves money only on approval (§10 #3).
 */
export function goalContributed(goal: Goal, txns: Transaction[]): number {
  let total = goal.opening_contributed;
  for (const t of txns) {
    if (!isLiveLedgerRow(t) || !isTransfer(t)) continue;
    if (t.date < goal.created_date) continue; // before the cycle → not this goal's
    if (t.to_container_id === goal.container_id) total -= t.amount; // inflow (amount<0)
    if (t.container_id === goal.container_id) total += t.amount; // outflow (reallocated away)
  }
  return total;
}

/**
 * The quantity a goal's ask + progress measure against (§5.9.7): `contributed`
 * for `spend_down`, live `balance` for `reserve` (so a withdrawal re-opens it).
 */
export function goalBasis(goal: Goal, txns: Transaction[]): number {
  return goal.kind === "reserve"
    ? containerBalance(txns, goal.container_id)
    : goalContributed(goal, txns);
}

/**
 * Progress fraction (§5.9.7): `basis / target_amount`. `null` when there is no
 * target (open-ended fixed / loose passive) — no denominator, so no bar. May
 * exceed 1 for an over-contributed spend_down goal; callers cap the *display* at
 * 100%, not the value.
 */
export function goalProgress(goal: Goal, txns: Transaction[]): number | null {
  if (goal.target_amount === null || goal.target_amount === 0) return null;
  return goalBasis(goal, txns) / goal.target_amount;
}

/**
 * `required_monthly` (§5.9.4/.7) — the per-month ask the monthly plan (§6.8) sums:
 *   - `passive` → 0 (claims nothing).
 *   - `fixed`   → the committed M until the target is reached (0 once `basis ≥
 *     target`); open-ended fixed (no target) always asks M.
 *   - `deadline`→ `ceil(max(0, target − basis) / whole_months_left)`, current
 *     month inclusive. At/after the deadline (`months ≤ 0`) the divisor would be
 *     ≤ 0, so the ask is the full remaining and `requiresReplan` fires (§5.9.7).
 * Rounded UP so the target is actually reached by the deadline (under-asking would
 * leave a cent short).
 */
export function requiredMonthly(goal: Goal, txns: Transaction[], today: ISO): number {
  if (goal.mode === "passive") return 0;
  const basis = goalBasis(goal, txns);
  const target = goal.target_amount;

  if (goal.mode === "fixed") {
    const M = goal.planned_monthly ?? 0;
    if (target !== null && basis >= target) return 0;
    return M;
  }

  // deadline
  const remaining = Math.max(0, (target ?? 0) - basis);
  if (remaining === 0) return 0;
  const months = goal.deadline ? wholeMonthsUntil(today, goal.deadline) : 0;
  if (months <= 0) return remaining; // at/after deadline → full remaining (no ÷0)
  return Math.ceil(remaining / months);
}

/**
 * True when a deadline goal is at/after its deadline and still short (§5.9.7) —
 * the app surfaces a re-plan prompt (push the date or lower the target) rather
 * than silently smoothing the number.
 */
export function requiresReplan(goal: Goal, txns: Transaction[], today: ISO): boolean {
  if (goal.mode !== "deadline" || goal.deadline === null || goal.target_amount === null) {
    return false;
  }
  return (
    wholeMonthsUntil(today, goal.deadline) <= 0 &&
    goalBasis(goal, txns) < goal.target_amount
  );
}

/**
 * Achieved = the terminal-completion test (§5.9.6). A `spend_down` goal completes
 * and closes once `contributed ≥ target`. A `reserve` goal never latches — it
 * oscillates around its set-point — so this is always false for reserves.
 */
export function isAchieved(goal: Goal, txns: Transaction[]): boolean {
  if (goal.kind === "reserve" || goal.target_amount === null) return false;
  return goalContributed(goal, txns) >= goal.target_amount;
}

/**
 * `projected_completion` (§5.9.7) — advisory date a `fixed` goal *with a target*
 * reaches it at rate M. `null` for deadline/passive, open-ended fixed (no
 * target), or a non-positive M (never completes).
 */
export function projectedCompletion(
  goal: Goal,
  txns: Transaction[],
  today: ISO,
): ISO | null {
  if (goal.mode !== "fixed" || goal.target_amount === null) return null;
  const M = goal.planned_monthly ?? 0;
  if (M <= 0) return null;
  const remaining = Math.max(0, goal.target_amount - goalBasis(goal, txns));
  const months = Math.ceil(remaining / M);
  return format(addMonths(new Date(`${today}T00:00:00`), months), "yyyy-MM-dd");
}
