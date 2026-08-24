import { useCallback, useMemo } from "react";
import { useLocalPref } from "@/features/prefs";

export const COMMAND_HISTORY_KEY = "yaccount.command.history";
export const COMMAND_HISTORY_LIMIT = 6;
export const EMPTY_COMMAND_HISTORY = JSON.stringify({ version: 1, actionIds: [] });

const MAX_ACTION_ID_LENGTH = 256;

function isActionId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > "act:".length &&
    value.length <= MAX_ACTION_ID_LENGTH &&
    value.startsWith("act:") &&
    !/\s/.test(value)
  );
}

function normalizeActionIds(values: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values) {
    if (!isActionId(value) || seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
    if (normalized.length === COMMAND_HISTORY_LIMIT) break;
  }
  return normalized;
}

function storedActionIds(raw: string): unknown[] | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("version" in parsed) ||
      parsed.version !== 1 ||
      !("actionIds" in parsed) ||
      !Array.isArray(parsed.actionIds) ||
      !parsed.actionIds.every(isActionId)
    ) {
      return null;
    }
    return parsed.actionIds;
  } catch {
    return null;
  }
}

function isCommandHistoryEnvelope(value: string): value is string {
  return storedActionIds(value) !== null;
}

/** localStorage is untrusted convenience state. Only the current envelope and
 * opaque action ids survive; every other shape degrades to an empty list. */
export function parseCommandHistory(raw: string | null): string[] {
  if (!raw) return [];
  const actionIds = storedActionIds(raw);
  return actionIds ? normalizeActionIds(actionIds) : [];
}

export function encodeCommandHistory(actionIds: readonly string[]): string {
  return JSON.stringify({ version: 1, actionIds: normalizeActionIds(actionIds) });
}

/** Update recency and compact ids that no longer resolve in the live catalog.
 * No stored id is authoritative enough to create or resurrect an action. */
export function rememberCommandAction(
  history: readonly string[],
  actionId: string,
  availableActionIds: readonly string[],
): string[] {
  const available = new Set(availableActionIds);
  const next = history.filter((id) => id !== actionId && available.has(id));
  if (available.has(actionId)) next.unshift(actionId);
  return normalizeActionIds(next);
}

/** Resolve opaque stored ids through the live catalog. The catalog owns labels,
 * eligibility and behavior; history owns recency only. */
export function commandDefaultGroups<T extends { id: string }>(
  actions: readonly T[],
  historyIds: readonly string[],
): { recent: T[]; common: T[] } {
  const byId = new Map(actions.map((action) => [action.id, action]));
  const recent: T[] = [];
  const recentIds = new Set<string>();
  for (const id of historyIds) {
    const action = byId.get(id);
    if (!action || recentIds.has(id)) continue;
    recent.push(action);
    recentIds.add(id);
    if (recent.length === COMMAND_HISTORY_LIMIT) break;
  }
  return {
    recent,
    common: actions.filter((action) => !recentIds.has(action.id)),
  };
}

/** Device-local convenience only. `useLocalPref` supplies SSR safety, blocked
 * storage fallback, and same-tab/cross-tab notifications. */
export function useCommandHistory(): [string[], (actionIds: readonly string[]) => void] {
  const [raw, setRaw] = useLocalPref<string>(
    COMMAND_HISTORY_KEY,
    EMPTY_COMMAND_HISTORY,
    isCommandHistoryEnvelope,
  );
  const history = useMemo(() => parseCommandHistory(raw), [raw]);
  const write = useCallback(
    (actionIds: readonly string[]) => setRaw(encodeCommandHistory(actionIds)),
    [setRaw],
  );
  return [history, write];
}
