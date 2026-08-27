import type { Transaction } from "@/core/model";

export type LedgerPagingStatus = "loading" | "ready" | "error";

export interface LedgerPagingState {
  rows: Transaction[];
  cursor: string | null;
  revision: number;
  complete: boolean;
  pageSize: 25 | 50;
  status: LedgerPagingStatus;
  error: string | null;
  newEntries: boolean;
  flashId: string | null;
}

export type LedgerPagingAction =
  | {
      type: "page";
      rows: Transaction[];
      cursor: string | null;
      revision: number;
      complete: boolean;
      append: boolean;
    }
  | { type: "query-change" }
  | { type: "local-add"; id: string }
  | { type: "remote-change"; revision: number; hasNewEntries: boolean }
  | { type: "revalidate"; rows: Transaction[]; revision: number }
  | { type: "jump-new" }
  | { type: "loading" }
  | { type: "error"; message: string };

export function pageSizeForWidth(width: number): 25 | 50 {
  return width < 640 ? 25 : 50;
}

export function initialLedgerPagingState(pageSize: 25 | 50): LedgerPagingState {
  return {
    rows: [],
    cursor: null,
    revision: 0,
    complete: false,
    pageSize,
    status: "loading",
    error: null,
    newEntries: false,
    flashId: null,
  };
}

function reset(state: LedgerPagingState): LedgerPagingState {
  return {
    ...state,
    rows: [],
    cursor: null,
    complete: false,
    status: "loading",
    error: null,
    newEntries: false,
  };
}

export function ledgerPagingReducer(
  state: LedgerPagingState,
  action: LedgerPagingAction,
): LedgerPagingState {
  switch (action.type) {
    case "page": {
      const rows = action.append
        ? [...state.rows, ...action.rows].filter(
            (row, index, all) => all.findIndex((candidate) => candidate.id === row.id) === index,
          )
        : action.rows;
      return {
        ...state,
        rows,
        cursor: action.cursor,
        revision: action.revision,
        complete: action.complete,
        status: "ready",
        error: null,
      };
    }
    case "query-change":
      return { ...reset(state), flashId: null };
    case "local-add":
      return { ...reset(state), flashId: action.id };
    case "remote-change":
      return {
        ...state,
        revision: action.revision,
        newEntries: state.newEntries || action.hasNewEntries,
      };
    case "revalidate":
      return { ...state, rows: action.rows, revision: action.revision };
    case "jump-new":
      return { ...reset(state), flashId: null };
    case "loading":
      return { ...state, status: "loading", error: null };
    case "error":
      return { ...state, status: "error", error: action.message };
  }
}
