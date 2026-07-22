import { describe, it, expect } from "vitest";
import { LogBuffer, redact, type LogRecord } from "./log-buffer";

const rec = (message: string, at = "2026-07-22T18:00:00.000Z"): LogRecord => ({
  at,
  level: "info",
  scope: "test",
  message,
});

describe("redact — a diagnostics log is meant to be pasted to someone else", () => {
  it("strips a Google access token", () => {
    const out = redact("GET failed: ya29.a0AfB_bY1234567890abcdefXYZ token expired");
    expect(out).not.toContain("ya29.a0AfB_bY");
    expect(out).toContain("[redacted");
    expect(out).toContain("token expired"); // the useful part survives
  });

  it("strips a JWT", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NSJ9.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1";
    expect(redact(`id_token=${jwt}`)).not.toContain("dBjftJeZ");
  });

  it("strips token fields out of a JSON error body", () => {
    const body = '{"access_token":"abc.def-123","refresh_token":"zzz","status":401}';
    const out = redact(body);
    expect(out).not.toContain("abc.def-123");
    expect(out).not.toContain("zzz");
    expect(out).toContain("401"); // the diagnostic value is kept
  });

  it("strips an Authorization header", () => {
    expect(redact("Authorization: Bearer sekrit-value-here")).not.toContain("sekrit");
  });

  it("strips email addresses", () => {
    const out = redact("signed in as someone@example.com");
    expect(out).not.toContain("someone@example.com");
    expect(out).toContain("signed in as");
  });

  it("leaves ordinary diagnostic text alone", () => {
    const text = "Drive 403: insufficient permissions for file ledger_ab12.json";
    expect(redact(text)).toBe(text);
  });

  it("keeps the device id — it is the user's own, and sync bugs need it", () => {
    const text = "deviceId 6f1c2b30-1a2b-4c3d-8e4f-5a6b7c8d9e0f";
    expect(redact(text)).toBe(text);
  });
});

describe("LogBuffer — a bounded window of what just happened", () => {
  it("keeps records in the order they arrived", () => {
    const b = new LogBuffer(10);
    b.push(rec("first"));
    b.push(rec("second"));
    expect(b.records().map((r) => r.message)).toEqual(["first", "second"]);
  });

  it("evicts the oldest once it is full, so it can never grow unbounded", () => {
    const b = new LogBuffer(3);
    for (const m of ["a", "b", "c", "d", "e"]) b.push(rec(m));
    expect(b.records().map((r) => r.message)).toEqual(["c", "d", "e"]);
    expect(b.records()).toHaveLength(3);
  });

  it("redacts on the way IN, so a secret is never held in memory", () => {
    const b = new LogBuffer(10);
    b.push({ ...rec("token ya29.abcdefghijklmnop"), detail: "Bearer sekrit-value" });
    const [only] = b.records();
    expect(only.message).not.toContain("ya29.abcdefghijklmnop");
    expect(only.detail).not.toContain("sekrit");
  });

  it("hands out a copy, so a caller cannot mutate the log", () => {
    const b = new LogBuffer(10);
    b.push(rec("first"));
    b.records().push(rec("injected"));
    expect(b.records()).toHaveLength(1);
  });

  it("clears", () => {
    const b = new LogBuffer(10);
    b.push(rec("first"));
    b.clear();
    expect(b.records()).toEqual([]);
  });

  it("renders as pasteable text, newest last, with level and scope", () => {
    const b = new LogBuffer(10);
    b.push({ ...rec("opened"), level: "info", scope: "repo" });
    b.push({ ...rec("sync failed"), level: "error", scope: "sync", detail: "Drive 403" });
    const text = b.toText();
    expect(text).toContain("INFO");
    expect(text).toContain("repo");
    expect(text).toContain("opened");
    expect(text).toContain("Drive 403");
    expect(text.indexOf("opened")).toBeLessThan(text.indexOf("sync failed"));
  });

  it("says so when nothing has been logged, rather than returning a blank", () => {
    expect(new LogBuffer(10).toText()).toMatch(/no log/i);
  });

  it("tolerates a zero or negative capacity without wedging", () => {
    const b = new LogBuffer(0);
    b.push(rec("x"));
    expect(b.records().length).toBeLessThanOrEqual(1);
  });
});
