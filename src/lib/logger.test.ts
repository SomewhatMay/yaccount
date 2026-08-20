import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  BROWSER_ONLY_FACTS,
  buildDiagnostics,
  createLogger,
  getLogLevel,
  logBuffer,
  setLogLevel,
  withoutBrowserFacts,
} from "./logger";

beforeEach(() => {
  logBuffer.clear();
  // The console is not what is under test; keep the suite output readable.
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "debug").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  setLogLevel("info");
});

describe("createLogger — everything logged reaches Diagnostics", () => {
  it("records the message, its level and its scope", () => {
    createLogger("repo").info("opened the database");
    const [rec] = logBuffer.records();
    expect(rec.level).toBe("info");
    expect(rec.scope).toBe("repo");
    expect(rec.message).toBe("opened the database");
  });

  it("captures debug records even when the console is quiet", () => {
    // loglevel replaces a below-level method with a no-op, so tapping IT would
    // capture nothing here. Diagnostics needs the trail regardless of verbosity.
    setLogLevel("error");
    createLogger("sync").debug("pulling ledgers");
    expect(logBuffer.records().map((r) => r.message)).toContain("pulling ledgers");
  });

  it("keeps every level in one ordered trail", () => {
    const log = createLogger("app");
    log.debug("a");
    log.info("b");
    log.warn("c");
    log.error("d");
    expect(logBuffer.records().map((r) => r.message)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("capture — one description for the toast and the log", () => {
  it("returns the same summary it records, so they can never disagree", () => {
    const summary = createLogger("store").capture("dispatch failed", new Error("Quota"));
    expect(summary).toBe("Quota");
    const [rec] = logBuffer.records();
    expect(rec.level).toBe("error");
    expect(rec.message).toContain("dispatch failed");
    expect(rec.message).toContain("Quota");
  });

  it("keeps the stack in the detail, out of the user's way", () => {
    createLogger("store").capture("boom", new Error("inner"));
    expect(logBuffer.records()[0].detail).toMatch(/inner/);
  });

  it("describes a non-Error throw rather than logging [object Object]", () => {
    const summary = createLogger("sync").capture("sync failed", {
      status: 403,
      body: "insufficientPermissions",
    });
    expect(summary).toContain("403");
    expect(logBuffer.records()[0].message).not.toContain("[object Object]");
  });

  it("redacts credentials on the way into the buffer", () => {
    createLogger("sync").capture(
      "token refresh failed",
      new Error("bad token ya29.SECRETVALUE123"),
    );
    const text = JSON.stringify(logBuffer.records());
    expect(text).not.toContain("SECRETVALUE123");
  });
});

describe("buildDiagnostics — what actually gets pasted into a bug report", () => {
  it("puts the install facts above the log", () => {
    createLogger("sync").capture("sync failed", new Error("Drive 403"));
    const text = buildDiagnostics({ "device id": "dev-1", transactions: 42 });
    expect(text).toContain("device id: dev-1");
    expect(text).toContain("transactions: 42");
    expect(text).toContain("Drive 403");
    expect(text.indexOf("device id")).toBeLessThan(text.indexOf("Drive 403"));
  });

  it("renders a missing fact as a dash instead of 'null'", () => {
    expect(buildDiagnostics({ "device id": null })).toContain("device id: —");
  });

  it("still produces something useful when nothing has been logged", () => {
    expect(buildDiagnostics({ ok: 1 })).toMatch(/no log/i);
  });
});

describe("withoutBrowserFacts — the first render has to match the prerendered HTML", () => {
  // `/settings` is statically exported, so the HTML is built on a machine with
  // no `navigator`. If the browser's FIRST render shows the real user agent and
  // the HTML shows a dash, React reports a hydration mismatch. Blank these
  // three until after the mount; everything else already agrees.
  const facts = {
    "user agent": "Mozilla/5.0 (X11; Linux x86_64)",
    language: "en-CA",
    "time zone": "America/Toronto",
    "device id": "dev-1",
    transactions: 42,
  };

  it("blanks exactly the facts the build machine cannot know", () => {
    expect(withoutBrowserFacts(facts)).toEqual({
      "user agent": null,
      language: null,
      "time zone": null,
      "device id": "dev-1",
      transactions: 42,
    });
  });

  it("keeps every other fact, including the falsy ones", () => {
    expect(withoutBrowserFacts({ transactions: 0, "device id": null })).toEqual({
      transactions: 0,
      "device id": null,
    });
  });

  it("does not change the input", () => {
    const input = { ...facts };
    withoutBrowserFacts(input);
    expect(input).toEqual(facts);
  });

  it("names the browser-only facts so the panel and the test cannot drift", () => {
    expect([...BROWSER_ONLY_FACTS].sort()).toEqual([
      "language",
      "time zone",
      "user agent",
    ]);
  });
});

describe("the log level is a real, readable setting", () => {
  it("round-trips", () => {
    setLogLevel("warn");
    expect(getLogLevel()).toBe("warn");
    setLogLevel("debug");
    expect(getLogLevel()).toBe("debug");
  });
});
