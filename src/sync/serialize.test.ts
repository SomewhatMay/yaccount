import { describe, it, expect } from "vitest";
import { serializeOps, parseOps, serializeSnapshot, parseSnapshot } from "./serialize";
import {
  SNAPSHOT_PATH,
  ledgerPath,
  archivePath,
  isLiveLedgerName,
  deviceIdFromLedgerName,
} from "./paths";
import type { Op } from "@/core/oplog";

const op = (id: string, ts: string): Op =>
  ({ id, ts, type: "category.archive", payload: { id: "x" } }) as Op;

describe("serialize — JSONL ledgers + JSON snapshot (§8.2)", () => {
  it("round-trips ops through JSONL", () => {
    const ops = [
      op("a", "2026-01-01T00:00:00.000Z"),
      op("b", "2026-01-02T00:00:00.000Z"),
    ];
    expect(parseOps(serializeOps(ops))).toEqual(ops);
  });

  it("serializes an empty op list to an empty string (nothing to append)", () => {
    expect(serializeOps([])).toBe("");
    expect(parseOps("")).toEqual([]);
  });

  it("tolerates a torn/blank trailing line (crash resistance)", () => {
    const good = op("a", "2026-01-01T00:00:00.000Z");
    const text = JSON.stringify(good) + "\n" + '{"id":"b","ts":"2026'; // interrupted append
    expect(parseOps(text)).toEqual([good]); // the torn line is dropped, not thrown on
  });

  it("round-trips a snapshot and tolerates a corrupt one", () => {
    const ops = [op("a", "2026-01-01T00:00:00.000Z")];
    expect(parseSnapshot(serializeSnapshot(ops))).toEqual(ops);
    expect(parseSnapshot("not json")).toEqual([]);
  });
});

describe("paths — per-device Drive layout (§8.4)", () => {
  it("distinguishes a live ledger from a dated archive", () => {
    expect(ledgerPath("dev1")).toBe("ledger_dev1.json");
    expect(archivePath("dev1", "2026-07")).toBe("ledger_dev1_2026-07.json");
    expect(isLiveLedgerName("ledger_dev1.json")).toBe(true);
    expect(isLiveLedgerName("ledger_dev1_2026-07.json")).toBe(false); // archive
    expect(isLiveLedgerName("snapshot.json")).toBe(false);
    expect(SNAPSHOT_PATH).toBe("snapshot.json");
  });

  it("extracts the deviceId from a live ledger name only", () => {
    expect(deviceIdFromLedgerName("ledger_abc-123.json")).toBe("abc-123");
    expect(deviceIdFromLedgerName("ledger_abc_2026-07.json")).toBeNull();
    expect(deviceIdFromLedgerName("snapshot.json")).toBeNull();
  });

  it("handles a UUID deviceId with hyphens (not mistaken for an archive)", () => {
    const id = "550e8400-e29b-41d4-a716-446655440000";
    expect(isLiveLedgerName(ledgerPath(id))).toBe(true);
    expect(deviceIdFromLedgerName(ledgerPath(id))).toBe(id);
  });
});
