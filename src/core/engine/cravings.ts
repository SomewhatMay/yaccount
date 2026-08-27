import type { CravingWin, Transaction } from "../model";
import { activeRows } from "./ledger";
import { isTransfer } from "./balances";

export interface CravingWinSummary {
  totalKept: number;
  thisMonthKept: number;
  winCount: number;
  movedToGoals: number;
}

export interface CravingWinYear {
  year: string;
  totalKept: number;
  winCount: number;
  wins: CravingWin[];
}

/** Newest first, using the occurrence instant and id as deterministic ties. */
export function sortCravingWins(wins: readonly CravingWin[]): CravingWin[] {
  return [...wins].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (a.occurred_at !== b.occurred_at) return a.occurred_at < b.occurred_at ? 1 : -1;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
}

export function cravingWinSummary(
  wins: readonly CravingWin[],
  transactions: readonly Transaction[],
  today: string,
): CravingWinSummary {
  const month = today.slice(0, 7);
  const liveTransfers = new Map(
    activeRows([...transactions])
      .filter(isTransfer)
      .map((transaction) => [transaction.id, transaction]),
  );

  let totalKept = 0;
  let thisMonthKept = 0;
  let movedToGoals = 0;
  for (const win of wins) {
    totalKept += win.amount_kept;
    if (win.date.startsWith(month)) thisMonthKept += win.amount_kept;
    if (win.transfer_transaction_id) {
      const transfer = liveTransfers.get(win.transfer_transaction_id);
      if (transfer) movedToGoals += Math.abs(transfer.amount);
    }
  }

  return { totalKept, thisMonthKept, winCount: wins.length, movedToGoals };
}

/** Running all-time amount from oldest choice to newest. */
export function cravingWinCumulativeSeries(wins: readonly CravingWin[]): number[] {
  let total = 0;
  return sortCravingWins(wins)
    .reverse()
    .map((win) => (total += win.amount_kept));
}

/** Calendar years newest first; each year's register is newest first too. */
export function groupCravingWinsByYear(wins: readonly CravingWin[]): CravingWinYear[] {
  const groups = new Map<string, CravingWin[]>();
  for (const win of sortCravingWins(wins)) {
    const year = win.date.slice(0, 4);
    groups.set(year, [...(groups.get(year) ?? []), win]);
  }
  return [...groups].map(([year, rows]) => ({
    year,
    totalKept: rows.reduce((sum, row) => sum + row.amount_kept, 0),
    winCount: rows.length,
    wins: rows,
  }));
}
