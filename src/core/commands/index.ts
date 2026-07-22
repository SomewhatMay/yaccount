import {
  makeBudgetTarget,
  makeCategory,
  makeContainer,
  makeContainerSnapshot,
  makeGoal,
  makeRecurringRule,
  makeSetting,
  makeTemplate,
  makeTransaction,
  makeTransfer,
  makeVoidRow,
  newId,
  SETTING,
  type AmountMode,
  type BudgetTarget,
  type Category,
  type CategoryType,
  type Container,
  type ContainerSnapshot,
  type Frequency,
  type Goal,
  type GoalKind,
  type GoalMode,
  type IntervalConfig,
  type RecurringRule,
  type Transaction,
} from "../model";
import type { Op } from "../oplog";

/**
 * Commands (impl §3): pure builders that turn a UI intent into exactly one Op
 * `{ id, ts, type, payload }`. They mint the op id + timestamp (injectable via
 * `meta` for deterministic tests) and construct the row via the model factories.
 * `Repo.dispatch` then appends + applies the op atomically (§0.1). No IndexedDB,
 * no React here — pure and unit-testable (`src/core` boundary, §0.7).
 */
export interface OpMeta {
  id?: string; // op id — defaults to a fresh UUID
  ts?: string; // op timestamp — defaults to now (ISO)
}

function meta(m?: OpMeta): { id: string; ts: string } {
  return { id: m?.id ?? newId(), ts: m?.ts ?? new Date().toISOString() };
}

// ── Categories (§5.1, §5.5) ───────────────────────────────────────────────

export function createCategory(
  input: { name: string; type: CategoryType; id?: string; color?: string | null },
  m?: OpMeta,
): Op {
  return { ...meta(m), type: "category.create", payload: { row: makeCategory(input) } };
}

/** Rename / edit: the caller passes the whole edited row (entity-LWW). */
export function updateCategory(row: Category, m?: OpMeta): Op {
  return { ...meta(m), type: "category.update", payload: { row } };
}

/** Soft delete only (§5.5) — never a destructive removal. */
export function archiveCategory(id: string, m?: OpMeta): Op {
  return { ...meta(m), type: "category.archive", payload: { id } };
}

/** Put it back. Undo is first-class: nothing the user can do is one-way. */
export function unarchiveCategory(id: string, m?: OpMeta): Op {
  return { ...meta(m), type: "category.unarchive", payload: { id } };
}

// ── Transactions (§5.4) ───────────────────────────────────────────────────

export function createTransaction(
  input: {
    date: string;
    amount: number; // signed cents
    vendor_source: string;
    category_id: string;
    id?: string;
    container_id?: string;
    notes?: string | null;
  },
  m?: OpMeta,
): Op {
  const op = meta(m);
  // The op already holds the authoritative instant (it is the total order's sort
  // key, §8.2). Reusing it for the row keeps state and journal in agreement and
  // keeps commands deterministic when tests inject `meta` — no second clock read.
  return {
    ...op,
    type: "transaction.create",
    payload: { row: makeTransaction({ ...input, entered_at: op.ts }) },
  };
}

/** Edit: the caller passes the whole edited row (entity-LWW). */
export function updateTransaction(row: Transaction, m?: OpMeta): Op {
  return { ...meta(m), type: "transaction.update", payload: { row } };
}

/**
 * "Delete" = void (§0.3): append a reversing row linked to `original` via
 * `reverses_id`; the original is never touched. `voidId` sets the reversing
 * row's own id; `on` optionally re-dates it.
 */
export function voidTransaction(
  original: Transaction,
  m?: OpMeta & { voidId?: string; on?: string },
): Op {
  const op = meta(m);
  const row = makeVoidRow(original, { id: m?.voidId, on: m?.on, entered_at: op.ts });
  return { ...op, type: "transaction.void", payload: { row } };
}

/**
 * Undo a delete: append a row reversing the *reversing* row, which nets the void
 * back out and makes the original live again (`activeRows`). Nothing is ever
 * rewritten — the journal keeps delete and undelete as two visible events, so a
 * ledger reads like a git history rather than a series of disappearances.
 */
export function unvoidTransaction(
  voidRow: Transaction,
  m?: OpMeta & { voidId?: string; on?: string },
): Op {
  const op = meta(m);
  const row = makeVoidRow(voidRow, { id: m?.voidId, on: m?.on, entered_at: op.ts });
  return { ...op, type: "transaction.void", payload: { row } };
}

// ── Containers (§5.2, §5.5) ───────────────────────────────────────────────

/** New container. `include_in_overall_balance` defaults FALSE (opt-in, §5.7). */
export function createContainer(
  input: {
    name: string;
    id?: string;
    is_investment?: boolean;
    include_in_overall_balance?: boolean;
  },
  m?: OpMeta,
): Op {
  return { ...meta(m), type: "container.create", payload: { row: makeContainer(input) } };
}

/** Rename / flip a flag: the caller passes the whole edited row (entity-LWW). */
export function updateContainer(row: Container, m?: OpMeta): Op {
  return { ...meta(m), type: "container.update", payload: { row } };
}

/** Soft delete only (§5.5) — an archived container stays a valid FK target. */
export function archiveContainer(id: string, m?: OpMeta): Op {
  return { ...meta(m), type: "container.archive", payload: { id } };
}

/** Put it back (see `unarchiveCategory`). */
export function unarchiveContainer(id: string, m?: OpMeta): Op {
  return { ...meta(m), type: "container.unarchive", payload: { id } };
}

// ── Transfers (§5.4) ──────────────────────────────────────────────────────

/**
 * Move money between two owned containers: ONE negative row on the source, no
 * category. It is an ordinary `transaction.create` — the shape is in the row's
 * fields, not in a separate op type.
 */
export function createTransfer(
  input: {
    date: string;
    amount: number; // positive magnitude in cents
    container_id: string;
    to_container_id: string;
    fromName?: string;
    toName?: string;
    vendor_source?: string;
    id?: string;
    notes?: string | null;
  },
  m?: OpMeta,
): Op {
  const op = meta(m);
  return {
    ...op,
    type: "transaction.create",
    payload: { row: makeTransfer({ ...input, entered_at: op.ts }) },
  };
}

// ── Container snapshots (§5.6) ────────────────────────────────────────────

/** Log a container's real-world reported value; snapshots accumulate. */
export function recordSnapshot(
  input: {
    container_id: string;
    date: string;
    reported_balance: number; // integer cents
    id?: string;
  },
  m?: OpMeta,
): Op {
  return {
    ...meta(m),
    type: "snapshot.record",
    payload: { row: makeContainerSnapshot(input) },
  };
}

/** Correct a reported value in place (entity-LWW). */
export function updateSnapshot(row: ContainerSnapshot, m?: OpMeta): Op {
  return { ...meta(m), type: "snapshot.update", payload: { row } };
}

/** Remove a mistaken report. The removal is itself an op, so the journal keeps
 * the whole history — state is the replay, the log is the audit trail. */
export function removeSnapshot(id: string, m?: OpMeta): Op {
  return { ...meta(m), type: "snapshot.remove", payload: { id } };
}

// ── Settings (M3) ─────────────────────────────────────────────────────────

/** Set any synced preference (entity-LWW by key). */
export function setSetting(key: string, value: string, m?: OpMeta): Op {
  return { ...meta(m), type: "setting.set", payload: { row: makeSetting(key, value) } };
}

/** Default Spending Container (§5.2) — what the compose bar preselects. */
export function setDefaultContainer(containerId: string, m?: OpMeta): Op {
  return setSetting(SETTING.defaultContainerId, containerId, m);
}

// ── Budget targets (§5.3, M4) ─────────────────────────────────────────────

/**
 * Set a category's budget effective from a date. Upserts by the natural key
 * `(category_id, start_date)` (§5.3) — pass an existing row's `id` to edit it
 * in place; a new `id` (or none) creates a fresh effective-date row instead.
 */
export function setBudgetTarget(
  input: { category_id: string; amount: number; start_date: string; id?: string },
  m?: OpMeta,
): Op {
  return {
    ...meta(m),
    type: "budgetTarget.set",
    payload: { row: makeBudgetTarget(input) },
  };
}

/** Remove a superseded budget row. The removal is itself an op, so the journal
 * keeps the history — a superseded target is housekeeping, not a ledger amount. */
export function removeBudgetTarget(id: string, m?: OpMeta): Op {
  return { ...meta(m), type: "budgetTarget.remove", payload: { id } };
}

// ── Templates (§5.8, M6) ──────────────────────────────────────────────────

/**
 * Save a 1-tap shortcut. A template is a transactions row with is_template=true —
 * an expense/income (pass `category_id`) or a transfer (pass `to_container_id`),
 * never both. Amount is signed for expense/income, a positive magnitude for a
 * transfer (matching the two generators).
 */
export function createTemplate(
  input: {
    template_name: string;
    amount: number;
    vendor_source: string;
    container_id: string;
    category_id?: string | null;
    to_container_id?: string | null;
    id?: string;
    notes?: string | null;
  },
  m?: OpMeta,
): Op {
  const op = meta(m);
  return {
    ...op,
    type: "template.create",
    payload: { row: makeTemplate({ ...input, entered_at: op.ts }) },
  };
}

/** Delete a shortcut — a hard remove (housekeeping, not ledger data). */
export function removeTemplate(id: string, m?: OpMeta): Op {
  return { ...meta(m), type: "template.remove", payload: { id } };
}

/**
 * 1-tap quick-log: turn a saved template into a real, dated ledger row (a fresh
 * id, `is_template=false`, approved). The shape follows the template — a transfer
 * template logs a transfer, otherwise an expense/income.
 */
export function logTemplate(
  template: Transaction,
  input: { date: string; id?: string },
  m?: OpMeta,
): Op {
  if (template.to_container_id !== null) {
    return createTransfer(
      {
        id: input.id,
        date: input.date,
        amount: Math.abs(template.amount),
        container_id: template.container_id,
        to_container_id: template.to_container_id,
        vendor_source: template.vendor_source,
      },
      m,
    );
  }
  return createTransaction(
    {
      id: input.id,
      date: input.date,
      amount: template.amount,
      vendor_source: template.vendor_source,
      category_id: template.category_id!,
      container_id: template.container_id,
    },
    m,
  );
}

// ── Recurring rules (§5.8, M6) ────────────────────────────────────────────

export function createRecurringRule(
  input: {
    frequency: Frequency;
    interval_config: IntervalConfig;
    template_vendor_source: string;
    template_container_id: string;
    start_date: string;
    id?: string;
    template_amount?: number | null;
    template_category_id?: string | null;
    template_to_container_id?: string | null;
    amount_mode?: AmountMode;
    linked_goal_id?: string | null;
    end_date?: string | null;
  },
  m?: OpMeta,
): Op {
  return {
    ...meta(m),
    type: "recurringRule.create",
    payload: { row: makeRecurringRule(input) },
  };
}

/** Edit a rule (entity-LWW). Also the advance path: generation hands back the
 * rule with its `next_generation_date` moved on, persisted via this op. */
export function updateRecurringRule(row: RecurringRule, m?: OpMeta): Op {
  return { ...meta(m), type: "recurringRule.update", payload: { row } };
}

/** Stop a rule generating (reversible §1.1) — already-generated pending rows stay. */
export function cancelRecurringRule(id: string, m?: OpMeta): Op {
  return { ...meta(m), type: "recurringRule.cancel", payload: { id } };
}

/** Put a cancelled rule back to work. */
export function uncancelRecurringRule(id: string, m?: OpMeta): Op {
  return { ...meta(m), type: "recurringRule.uncancel", payload: { id } };
}

// ── Inbox (§5.8, M6) ──────────────────────────────────────────────────────

/** Approve a pending row → it becomes live (counts toward balances/reports). */
export function approveTransaction(id: string, m?: OpMeta): Op {
  return { ...meta(m), type: "transaction.approve", payload: { id } };
}

/**
 * Persist a recurring-generated occurrence row (already keyed to `(rule, date)`,
 * pending). It's an ordinary `transaction.create` — the row carries its own
 * pending status + `recurring_rule_id`, so no new op type is needed.
 */
export function recordGeneratedOccurrence(row: Transaction, m?: OpMeta): Op {
  return { ...meta(m), type: "transaction.create", payload: { row } };
}

// ── Goals (§5.9, M7) ──────────────────────────────────────────────────────

/**
 * Create a goal — a purpose+plan layered onto a container (§5.9). The model
 * factory validates the mode/kind cross-field rules, so an incoherent goal never
 * reaches the journal. Auto-creating/reusing the container and enforcing the
 * ≤1-active-goal rule (§5.9.2) are app-level concerns handled by the caller.
 */
export function createGoal(
  input: {
    container_id: string;
    kind: GoalKind;
    mode: GoalMode;
    created_date: string;
    id?: string;
    name?: string | null;
    target_amount?: number | null;
    deadline?: string | null;
    planned_monthly?: number | null;
    opening_contributed?: number;
  },
  m?: OpMeta,
): Op {
  return { ...meta(m), type: "goal.create", payload: { row: makeGoal(input) } };
}

/** Edit a goal (entity-LWW) — the caller passes the whole edited row. Also the
 * reopen path for a completed goal (set status active, completed_date null). */
export function updateGoal(row: Goal, m?: OpMeta): Op {
  return { ...meta(m), type: "goal.update", payload: { row } };
}

/**
 * Mark a goal achieved (§5.9.6) — spend_down completes-and-closes once
 * `contributed ≥ target`. Latches status + `completed_date`; the goal stays
 * visible as achieved until archived. Cancelling the linked recurring rule is a
 * separate op the caller dispatches.
 */
export function completeGoal(id: string, date: string, m?: OpMeta): Op {
  return { ...meta(m), type: "goal.complete", payload: { id, date } };
}

/** End a goal (§5.9.6) — stops the ask, never moves money. Reversible (§1.1). */
export function cancelGoal(id: string, m?: OpMeta): Op {
  return { ...meta(m), type: "goal.cancel", payload: { id } };
}

/** Undo a cancellation — put the goal back to work. */
export function uncancelGoal(id: string, m?: OpMeta): Op {
  return { ...meta(m), type: "goal.uncancel", payload: { id } };
}

/** Soft-hide an achieved/abandoned goal (§5.9.2) — never a hard delete. */
export function archiveGoal(id: string, m?: OpMeta): Op {
  return { ...meta(m), type: "goal.archive", payload: { id } };
}

/** Put an archived goal back into the active list. */
export function unarchiveGoal(id: string, m?: OpMeta): Op {
  return { ...meta(m), type: "goal.unarchive", payload: { id } };
}

/** Convenience re-export for callers reading the row types. */
export type { BudgetTarget, ContainerSnapshot, Goal, RecurringRule };
