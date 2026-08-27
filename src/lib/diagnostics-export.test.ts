import { describe, expect, it } from "vitest";
import type { LogRecord } from "./log-buffer";
import { buildDiagnostics } from "./logger";
import { createDiagnosticsFile, mergeLogRecords } from "./diagnostics-export";

const records: LogRecord[] = [
  {
    at: "2026-08-27T08:00:00.000Z",
    level: "error",
    scope: "repo",
    message: "open failed",
    detail: "QuotaExceededError",
  },
];

describe("diagnostics export", () => {
  it("uses the supplied persisted trail in copy output", () => {
    const text = buildDiagnostics(
      {
        "app version": "1.2.3",
        "commit SHA": "0123456789abcdef",
        "commit URL": "https://github.com/example/repo/commit/0123456789abcdef",
      },
      records,
    );
    expect(text).toContain("app version: 1.2.3");
    expect(text).toContain("commit SHA: 0123456789abcdef");
    expect(text).toContain("open failed");
    expect(text).toContain("QuotaExceededError");
  });

  it("downloads that same plain text with a deterministic local filename", () => {
    const text = buildDiagnostics({ build: "local" }, records);
    expect(createDiagnosticsFile(text, new Date("2026-08-27T08:09:10.000Z"))).toEqual({
      name: "yaccount-diagnostics-2026-08-27T08-09-10Z.txt",
      type: "text/plain;charset=utf-8",
      text,
    });
  });

  it("keeps the memory tail when persistent storage missed its latest write", () => {
    const persisted = [records[0]];
    const memory = [
      records[0],
      {
        ...records[0],
        at: "2026-08-27T08:01:00.000Z",
        message: "latest write failed",
      },
    ];

    expect(mergeLogRecords(persisted, memory).map((record) => record.message)).toEqual([
      "open failed",
      "latest write failed",
    ]);
  });
});
