import { describe, expect, it, vi } from "vitest";
import {
  COMMAND_HISTORY_KEY,
  COMMAND_HISTORY_LIMIT,
  EMPTY_COMMAND_HISTORY,
  commandDefaultGroups,
  encodeCommandHistory,
  parseCommandHistory,
  rememberCommandAction,
  useCommandHistory,
} from "@/features/shell/command-history";

const pref = vi.hoisted(() => ({
  raw: JSON.stringify({ version: 1, actionIds: ["act:income"] }),
  setRaw: vi.fn(),
  args: null as null | {
    key: string;
    fallback: string;
    isValid: (value: string) => boolean;
  },
}));

vi.mock("@/features/prefs", () => ({
  useLocalPref: (key: string, fallback: string, isValid: (value: string) => boolean) => {
    pref.args = { key, fallback, isValid };
    return [pref.raw, pref.setRaw];
  },
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useMemo: <T>(factory: () => T) => factory(),
    useCallback: <T>(callback: T) => callback,
  };
});

describe("command history storage envelope", () => {
  it("fails open to no history for absent, corrupt, legacy, or future data", () => {
    for (const raw of [
      null,
      "",
      "not json",
      "[]",
      JSON.stringify({ version: 2, actionIds: ["act:income"] }),
      JSON.stringify({ version: 1, actionIds: "act:income" }),
      JSON.stringify({ version: 1, actionIds: ["act:income", 42] }),
      JSON.stringify({ version: 1, actionIds: ["/settings"] }),
    ]) {
      expect(parseCommandHistory(raw)).toEqual([]);
    }
  });

  it("deduplicates in first-seen order and caps storage work", () => {
    const ids = [
      "act:income",
      "act:expense",
      "act:income",
      "act:transfer",
      "act:sync",
      "act:investment:one",
      "act:investment:two",
      "act:investment:three",
    ];

    expect(parseCommandHistory(JSON.stringify({ version: 1, actionIds: ids }))).toEqual([
      "act:income",
      "act:expense",
      "act:transfer",
      "act:sync",
      "act:investment:one",
      "act:investment:two",
    ]);
    expect(COMMAND_HISTORY_LIMIT).toBe(6);
  });

  it("encodes only the canonical version and bounded action ids", () => {
    expect(
      encodeCommandHistory(["act:income", "act:income", "act:expense", "not-an-action"]),
    ).toBe(
      JSON.stringify({
        version: 1,
        actionIds: ["act:income", "act:expense"],
      }),
    );
  });
});

describe("rememberCommandAction", () => {
  const current = ["act:expense", "act:income", "act:transfer", "act:sync"];

  it("moves a repeated current action to the front without duplicates", () => {
    expect(
      rememberCommandAction(
        ["act:expense", "act:income", "act:transfer"],
        "act:income",
        current,
      ),
    ).toEqual(["act:income", "act:expense", "act:transfer"]);
  });

  it("compacts stale ids against the live catalog on the next write", () => {
    expect(
      rememberCommandAction(
        ["act:investment:archived", "act:expense", "act:gone"],
        "act:sync",
        current,
      ),
    ).toEqual(["act:sync", "act:expense"]);
  });

  it("does not admit an action absent from the live catalog", () => {
    expect(rememberCommandAction(["act:expense"], "act:gone", current)).toEqual([
      "act:expense",
    ]);
  });
});

describe("useCommandHistory", () => {
  it("uses the guarded local preference seam and writes canonical envelopes", () => {
    pref.setRaw.mockClear();
    const [history, setHistory] = useCommandHistory();

    expect(history).toEqual(["act:income"]);
    expect(pref.args?.key).toBe(COMMAND_HISTORY_KEY);
    expect(pref.args?.fallback).toBe(EMPTY_COMMAND_HISTORY);
    expect(pref.args?.isValid(encodeCommandHistory(["act:expense"]))).toBe(true);
    expect(pref.args?.isValid("not json")).toBe(false);

    setHistory(["act:sync", "act:sync", "act:expense"]);
    expect(pref.setRaw).toHaveBeenCalledWith(
      JSON.stringify({
        version: 1,
        actionIds: ["act:sync", "act:expense"],
      }),
    );
  });
});

describe("commandDefaultGroups", () => {
  it("resolves recent ids through the live catalog and avoids duplicate defaults", () => {
    const actions = [
      { id: "act:expense", label: "Expense" },
      { id: "act:income", label: "Income" },
      { id: "act:sync", label: "Sync" },
    ];

    const groups = commandDefaultGroups(actions, [
      "act:sync",
      "act:investment:archived",
      "act:income",
    ]);

    expect(groups.recent.map((action) => action.id)).toEqual(["act:sync", "act:income"]);
    expect(groups.common.map((action) => action.id)).toEqual(["act:expense"]);
  });

  it("keeps curated catalog order when there is no history", () => {
    const actions = [{ id: "act:expense" }, { id: "act:income" }];
    const groups = commandDefaultGroups(actions, []);

    expect(groups.recent).toEqual([]);
    expect(groups.common).toEqual(actions);
    expect(groups.common).not.toBe(actions);
  });
});
