import {
  createCravingWin,
  createTransfer,
  removeCravingWin,
  updateCravingWin,
  updateTransaction,
  voidTransaction,
} from "@/core/commands";
import { activeRows, isTransfer } from "@/core/engine";
import { parseDollars } from "@/core/money";
import {
  makeCravingWin,
  makeTransfer,
  newId,
  type Container,
  type CravingWin,
  type Goal,
  type Transaction,
} from "@/core/model";
import type { Op } from "@/core/oplog";

export interface CravingWinDraft {
  description: string;
  amountStr: string;
  date: string;
  occurredAt: string;
  categoryId: string | null;
  reflection: string;
  setAside: boolean;
  goalId: string;
  fundingContainerId: string;
}

export interface CravingWinComposeContext {
  existing: CravingWin | null;
  goals: Goal[];
  containers: Container[];
  transactions: Transaction[];
  makeId?: () => string;
}

export type CravingWinConfirmation = {
  kind: "update-transfer" | "reverse-transfer";
};

export type CravingWinComposeOutcome =
  | { status: "error"; message: string }
  | {
      status: "ready";
      row: CravingWin;
      transfer: Transaction | null;
      ops: Op[];
      confirmation: CravingWinConfirmation | null;
    };

const transferLabel = (description: string): string =>
  `Cravings Savings · ${description}`;

function liveLinkedTransfer(
  existing: CravingWin | null,
  transactions: Transaction[],
): Transaction | null {
  if (!existing?.transfer_transaction_id) return null;
  return (
    activeRows(transactions).find(
      (transaction) =>
        transaction.id === existing.transfer_transaction_id && isTransfer(transaction),
    ) ?? null
  );
}

function sameTransfer(a: Transaction, b: Transaction): boolean {
  return (
    a.date === b.date &&
    a.amount === b.amount &&
    a.vendor_source === b.vendor_source &&
    a.container_id === b.container_id &&
    a.to_container_id === b.to_container_id &&
    a.notes === b.notes &&
    a.entered_at === b.entered_at
  );
}

function sameMovement(a: Transaction, b: Transaction): boolean {
  return (
    a.date === b.date &&
    a.amount === b.amount &&
    a.container_id === b.container_id &&
    a.to_container_id === b.to_container_id &&
    a.entered_at === b.entered_at
  );
}

export function composeCravingWin(
  draft: CravingWinDraft,
  context: CravingWinComposeContext,
): CravingWinComposeOutcome {
  const description = draft.description.trim();
  if (!description) return { status: "error", message: "Say what you passed up." };

  let amount: number;
  try {
    amount = parseDollars(draft.amountStr);
  } catch {
    return { status: "error", message: "Enter a valid amount." };
  }
  if (amount <= 0) {
    return { status: "error", message: "Amount kept must be greater than zero." };
  }

  const makeId = context.makeId ?? newId;
  const existingTransfer = liveLinkedTransfer(context.existing, context.transactions);
  const winId = context.existing?.id ?? makeId();
  let goal: Goal | null = null;
  let funding: Container | null = null;

  if (draft.setAside) {
    goal = context.goals.find((candidate) => candidate.id === draft.goalId) ?? null;
    const keepsExistingGoal =
      existingTransfer !== null && context.existing?.goal_id === goal?.id;
    if (!goal || (!keepsExistingGoal && (goal.status !== "active" || goal.is_archived))) {
      return { status: "error", message: "Pick an active goal." };
    }

    funding =
      context.containers.find((container) => container.id === draft.fundingContainerId) ??
      null;
    const keepsExistingSource = existingTransfer?.container_id === funding?.id;
    if (!funding || (funding.is_archived && !keepsExistingSource)) {
      return { status: "error", message: "Pick a source container." };
    }
    if (funding.id === goal.container_id) {
      return {
        status: "error",
        message: "Pick a different container from the goal.",
      };
    }
  }

  try {
    if (!draft.setAside) {
      const row = makeCravingWin({
        id: winId,
        description,
        amount_kept: amount,
        date: draft.date,
        occurred_at: draft.occurredAt,
        category_id: draft.categoryId || null,
        reflection: draft.reflection,
      });
      const winOp = context.existing ? updateCravingWin(row) : createCravingWin(row);
      if (!existingTransfer) {
        return { status: "ready", row, transfer: null, ops: [winOp], confirmation: null };
      }
      const reverseOp = voidTransaction(existingTransfer, { voidId: makeId() });
      return {
        status: "ready",
        row,
        transfer: existingTransfer,
        ops: [winOp, reverseOp],
        confirmation: { kind: "reverse-transfer" },
      };
    }

    const selectedGoal = goal!;
    const selectedFunding = funding!;
    if (!existingTransfer) {
      const transferId = makeId();
      const transferOp = createTransfer({
        id: transferId,
        date: draft.date,
        entered_at: draft.occurredAt,
        amount,
        container_id: selectedFunding.id,
        to_container_id: selectedGoal.container_id,
        vendor_source: transferLabel(description),
      });
      const row = makeCravingWin({
        id: winId,
        description,
        amount_kept: amount,
        date: draft.date,
        occurred_at: draft.occurredAt,
        category_id: draft.categoryId || null,
        reflection: draft.reflection,
        goal_id: selectedGoal.id,
        transfer_transaction_id: transferId,
      });
      const winOp = context.existing ? updateCravingWin(row) : createCravingWin(row);
      return {
        status: "ready",
        row,
        transfer: transferOp.payload.row,
        ops: [winOp, transferOp],
        confirmation: null,
      };
    }

    const nextTransfer = makeTransfer({
      id: existingTransfer.id,
      date: draft.date,
      entered_at: draft.occurredAt,
      amount,
      container_id: selectedFunding.id,
      to_container_id: selectedGoal.container_id,
      vendor_source: transferLabel(description),
      notes: existingTransfer.notes,
    });
    const row = makeCravingWin({
      id: winId,
      description,
      amount_kept: amount,
      date: draft.date,
      occurred_at: draft.occurredAt,
      category_id: draft.categoryId || null,
      reflection: draft.reflection,
      goal_id: selectedGoal.id,
      transfer_transaction_id: existingTransfer.id,
    });
    const ops: Op[] = [updateCravingWin(row)];
    if (!sameTransfer(existingTransfer, nextTransfer)) {
      ops.push(updateTransaction(nextTransfer));
    }
    return {
      status: "ready",
      row,
      transfer: nextTransfer,
      ops,
      confirmation: sameMovement(existingTransfer, nextTransfer)
        ? null
        : { kind: "update-transfer" },
    };
  } catch {
    return { status: "error", message: "Pick a valid date and time." };
  }
}

export function composeCravingWinRemoval(
  win: CravingWin,
  transactions: Transaction[],
  reverseTransfer: boolean,
  options: { makeId?: () => string } = {},
): { ops: Op[]; reversal: Transaction | null } {
  const ops: Op[] = [removeCravingWin(win.id)];
  if (!reverseTransfer) return { ops, reversal: null };

  const transfer = liveLinkedTransfer(win, transactions);
  if (!transfer) return { ops, reversal: null };
  const reverseOp = voidTransaction(transfer, {
    voidId: (options.makeId ?? newId)(),
  });
  ops.push(reverseOp);
  return {
    ops,
    reversal: reverseOp.type === "transaction.void" ? reverseOp.payload.row : null,
  };
}
