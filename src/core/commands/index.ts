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
  DISTRIBUTION_DEFAULT_KEY,
  distributionKey,
  serializeDistributionPreset,
  type DistributionPreset,
  TransactionSchema,
  type AmountMode,
  type BudgetTarget,
  type Category,
  type CategoryType,
  type Container,
  type ContainerSnapshot,
  type CravingWin,
  type Frequency,
  type Goal,
  type GoalKind,
  type GoalMode,
  type IntervalConfig,
  type RecurringRule,
  type Transaction,
} from "../model";
import type { Op, TransactionCreateOp } from "../oplog";

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
  input: {
    name: string;
    type: CategoryType;
    id?: string;
    color?: string | null;
    icon?: string | null;
  },
  m?: OpMeta,
): Extract<Op, { type: "category.create" }> {
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
    entered_at?: string | null; // when the entry happened; defaults to the op's ts
    distribution_preset_id?: string | null;
  },
  m?: OpMeta,
): TransactionCreateOp {
  const op = meta(m);
  // The op already holds an authoritative instant (it is the total order's sort
  // key, §8.2), so it is the DEFAULT — "recorded now" — with no second clock read
  // and deterministic when tests inject `meta`. A caller-chosen time wins: the
  // entry time is an editable field, not an immutable audit stamp.
  return {
    ...op,
    type: "transaction.create",
    payload: {
      row: makeTransaction({ ...input, entered_at: input.entered_at ?? op.ts }),
    },
  };
}

/** Edit: the caller passes the whole edited row (entity-LWW). */
export function updateTransaction(row: Transaction, m?: OpMeta): Op {
  return { ...meta(m), type: "transaction.update", payload: { row } };
}

/** Explicitly associate a real manual row with the schedule occurrence it satisfies. */
export function linkTransactionToRecurringOccurrence(
  row: Transaction,
  ruleId: string,
  occurrenceDate: string,
  m?: OpMeta,
): Op {
  return updateTransaction(
    TransactionSchema.parse({
      ...row,
      recurring_rule_id: ruleId,
      recurring_occurrence_date: occurrenceDate,
    }),
    m,
  );
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
    entered_at?: string | null;
    distribution_parent_id?: string | null;
  },
  m?: OpMeta,
): TransactionCreateOp {
  const op = meta(m);
  return {
    ...op,
    type: "transaction.create",
    payload: { row: makeTransfer({ ...input, entered_at: input.entered_at ?? op.ts }) },
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
    distribution_preset_id?: string | null;
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
): TransactionCreateOp {
  if (template.to_container_id !== null) {
    return createTransfer(
      {
        id: input.id,
        date: input.date,
        amount: Math.abs(template.amount),
        container_id: template.container_id,
        to_container_id: template.to_container_id,
        vendor_source: template.vendor_source,
        notes: template.notes,
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
      notes: template.notes,
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

// ── Cravings Savings ──────────────────────────────────────────────────────

export function createCravingWin(row: CravingWin, m?: OpMeta): Op {
  return { ...meta(m), type: "cravingWin.create", payload: { row } };
}

export function updateCravingWin(row: CravingWin, m?: OpMeta): Op {
  return { ...meta(m), type: "cravingWin.update", payload: { row } };
}

/** A win is motivational history, not a ledger amount; removal stays in the journal. */
export function removeCravingWin(id: string, m?: OpMeta): Op {
  return { ...meta(m), type: "cravingWin.remove", payload: { id } };
}

/** Convenience re-export for callers reading the row types. */
export type { BudgetTarget, ContainerSnapshot, Goal, RecurringRule };

// ── Income distribution (plans/income-distribution.md) ────────────────────
//
// A distributed income is ordinary ops only — `transaction.create|update|void`,
// `transaction.approve` and `setting.set` — never a new op type, because an older
// client drops op types it doesn't know and would then disagree about state.
// The split is frozen into the rows here, at write time; nothing re-derives it.

/** The cents a piece of a split carries: one container, one positive amount. */
export interface DistributionPieceInput {
  container_id: string;
  amount: number;
}

/** A split ready to write (the `ok` branch of `splitIncome`). */
export interface ReadySplit {
  rest: { container_id: string; amount: number };
  pieces: DistributionPieceInput[];
}

/**
 * A piece's id at creation: deterministic from (parent, container). The recurring
 * generator already gives a pending occurrence a deterministic id (§6.6), so two
 * devices approving the same occurrence offline write the SAME piece rows — a
 * last-writer-wins put of identical money — instead of doubling the transfer.
 */
export function splitPieceId(parentId: string, containerId: string): string {
  return `${parentId}:split:${containerId}`;
}

/** Per-op meta for a batch: a caller-pinned `ts` applies to all, ids stay unique. */
function batchMeta(m: OpMeta | undefined, i: number): OpMeta {
  return { id: m?.id ? `${m.id}:${i}` : undefined, ts: m?.ts };
}

function assertSplitsAmount(split: ReadySplit, amount: number): void {
  const total = split.rest.amount + split.pieces.reduce((sum, p) => sum + p.amount, 0);
  if (total !== amount) {
    throw new Error(
      "the split doesn't add up to the income — recompute it for this amount",
    );
  }
}

/** One transfer `parent's container → piece container` per piece. */
function pieceOps(
  parent: Transaction,
  pieces: DistributionPieceInput[],
  taken: Set<string>,
  m: OpMeta | undefined,
  offset: number,
): TransactionCreateOp[] {
  const ops: TransactionCreateOp[] = [];
  for (const piece of pieces) {
    if (piece.amount <= 0 || piece.container_id === parent.container_id) continue;
    const wanted = splitPieceId(parent.id, piece.container_id);
    // A re-split that brings a container back must not reuse the id of a piece
    // that was voided: the old reversal would then cancel the new money.
    const id = taken.has(wanted) ? newId() : wanted;
    taken.add(id);
    ops.push(
      createTransfer(
        {
          id,
          date: parent.date,
          amount: piece.amount,
          container_id: parent.container_id,
          to_container_id: piece.container_id,
          vendor_source: parent.vendor_source,
          entered_at: parent.entered_at,
          distribution_parent_id: parent.id,
        },
        batchMeta(m, offset + ops.length),
      ),
    );
  }
  return ops;
}

/** Log an income and split it: the income lands in rest, each piece moves out. */
export function createDistributedIncome(
  input: {
    date: string;
    amount: number;
    vendor_source: string;
    category_id: string;
    preset_id: string;
    split: ReadySplit;
    id?: string;
    notes?: string | null;
    entered_at?: string | null;
  },
  m?: OpMeta,
): Op[] {
  assertSplitsAmount(input.split, input.amount);
  const parentOp = createTransaction(
    {
      id: input.id,
      date: input.date,
      amount: input.amount,
      vendor_source: input.vendor_source,
      category_id: input.category_id,
      container_id: input.split.rest.container_id,
      notes: input.notes,
      entered_at: input.entered_at,
      distribution_preset_id: input.preset_id,
    },
    batchMeta(m, 0),
  );
  const parent = parentOp.payload.row;
  return [parentOp, ...pieceOps(parent, input.split.pieces, new Set([parent.id]), m, 1)];
}

/**
 * Approve a pending income occurrence and split it, in one batch. The split is
 * computed now, at the approved amount — never at generation, where the amount
 * is only a proposal (§6.6).
 */
export function approveDistributed(
  pending: Transaction,
  presetId: string,
  split: ReadySplit,
  m?: OpMeta,
): Op[] {
  assertSplitsAmount(split, pending.amount);
  const approved = TransactionSchema.parse({
    ...pending,
    inbox_status: "approved",
    container_id: split.rest.container_id,
    distribution_preset_id: presetId,
  });
  const ops: Op[] = [approveTransaction(pending.id, batchMeta(m, 0))];
  if (
    approved.container_id !== pending.container_id ||
    approved.distribution_preset_id !== pending.distribution_preset_id
  ) {
    ops.push(updateTransaction(approved, batchMeta(m, 1)));
  }
  // Deterministic ids, never "fresh because taken": a second device approving
  // the same occurrence must land on these exact rows.
  return [...ops, ...pieceOps(approved, split.pieces, new Set(), m, ops.length)];
}

const PIECE_FIELDS = [
  "amount",
  "container_id",
  "date",
  "yearMonth",
  "vendor_source",
  "entered_at",
] as const;

/**
 * Write an edited distributed income and bring its pieces into line: the parent
 * row as given, each wanted piece updated in place (or created), every piece no
 * longer wanted voided — reversible, never deleted. Pieces always follow the
 * parent's date, payee and container, so the group moves as one.
 *
 * `desired` empty + parent `distribution_preset_id: null` = "untick Distribute".
 */
export function reconcileDistribution(
  input: {
    parent: Transaction;
    livePieces: Transaction[];
    desired: DistributionPieceInput[];
    allTxns: Transaction[];
  },
  m?: OpMeta,
): Op[] {
  const parent = TransactionSchema.parse(input.parent);
  const ops: Op[] = [updateTransaction(parent, batchMeta(m, 0))];
  const remaining = [...input.livePieces];
  const create: DistributionPieceInput[] = [];
  for (const want of input.desired) {
    if (want.amount <= 0 || want.container_id === parent.container_id) continue;
    const at = remaining.findIndex((p) => p.to_container_id === want.container_id);
    if (at < 0) {
      create.push(want);
      continue;
    }
    const [current] = remaining.splice(at, 1);
    const next = TransactionSchema.parse({
      ...current,
      amount: -want.amount,
      container_id: parent.container_id,
      date: parent.date,
      yearMonth: parent.yearMonth,
      vendor_source: parent.vendor_source,
      entered_at: parent.entered_at,
    });
    if (PIECE_FIELDS.some((f) => next[f] !== current[f])) {
      ops.push(updateTransaction(next, batchMeta(m, ops.length)));
    }
  }
  const taken = new Set(input.allTxns.map((t) => t.id));
  ops.push(...pieceOps(parent, create, taken, m, ops.length));
  for (const leftover of remaining) {
    ops.push(voidTransaction(leftover, batchMeta(m, ops.length)));
  }
  return ops;
}

/** Delete a distributed income: void the parent and every live piece together. */
export function voidDistribution(
  parent: Transaction,
  livePieces: Transaction[],
  m?: OpMeta,
): { ops: Op[]; voidRows: Transaction[] } {
  const ops = [parent, ...livePieces].map((row, i) =>
    voidTransaction(row, batchMeta(m, i)),
  );
  const voidRows = ops.map(
    (op) => (op as Extract<Op, { type: "transaction.void" }>).payload.row,
  );
  return { ops, voidRows };
}

/** Undo `voidDistribution`: reverse each reversal, so the whole group is live again. */
export function unvoidDistribution(voidRows: Transaction[], m?: OpMeta): Op[] {
  return voidRows.map((row, i) => unvoidTransaction(row, batchMeta(m, i)));
}

/**
 * Quick-log a shortcut. An income shortcut that carries a preset splits when the
 * caller hands it a split it could compute; otherwise (preset archived, rest
 * container gone) it logs one row into the shortcut's container, as before.
 */
export function logTemplateOps(
  template: Transaction,
  input: { date: string; id?: string },
  distribution: { presetId: string; split: ReadySplit } | null,
  m?: OpMeta,
): Op[] {
  if (template.to_container_id !== null || distribution === null) {
    return [logTemplate(template, input, m)];
  }
  return createDistributedIncome(
    {
      id: input.id,
      date: input.date,
      amount: template.amount,
      vendor_source: template.vendor_source,
      category_id: template.category_id!,
      notes: template.notes,
      preset_id: distribution.presetId,
      split: distribution.split,
    },
    m,
  );
}

/** Save a preset under its own settings key (per-preset LWW). Archive and restore
 * are this same write with `archived` flipped. */
export function setDistributionPreset(preset: DistributionPreset, m?: OpMeta): Op {
  return setSetting(distributionKey(preset.id), serializeDistributionPreset(preset), m);
}

/** Name the default preset, or clear it with null. */
export function setDefaultDistribution(presetId: string | null, m?: OpMeta): Op {
  return setSetting(DISTRIBUTION_DEFAULT_KEY, presetId ?? "", m);
}
