import loglevel from "loglevel";
import {
  LogBuffer,
  logRecordsToText,
  redactRecord,
  type LogLevel,
  type LogRecord,
} from "./log-buffer";
import { describeError, errorDetail } from "./errors";
import { persistentLog } from "./persistent-log";

/**
 * Application logging.
 *
 * `loglevel` gives us levels and named loggers, and — the
 * reason it is worth a dependency — it binds the real `console` method rather
 * than wrapping it, so devtools still reports the CALL SITE instead of pointing
 * every line back at this file.
 *
 * On top of it we tee every record into bounded memory and independent persistent
 * storage. yaccount has no server, so a bug report is whatever the user explicitly
 * copies or downloads from Diagnostics.
 */

/** The last few hundred records, for Diagnostics. Redacts on the way in. */
export const logBuffer = new LogBuffer(300);

// Verbose while developing, quiet in a build. This governs the CONSOLE only.
const DEFAULT_LEVEL: LogLevel = process.env.NODE_ENV === "development" ? "debug" : "info";
// Override any level persisted by the removed Settings selector. Production has
// one deliberate policy; diagnostics still retains every strategic record.
loglevel.setLevel(DEFAULT_LEVEL, false);

/**
 * The buffer is fed BEFORE loglevel gets a say, deliberately.
 *
 * loglevel doesn't filter at call time — below the active level it replaces the
 * method with a no-op — so hooking `methodFactory` would mean the buffer captured
 * exactly what the console already showed, and nothing when the console was
 * quiet. Diagnostics wants the opposite: the full trail in memory, a calm
 * console. The volume here is boot, failed writes and sync, so 300 records is
 * days of use, not seconds.
 */
function record(
  level: LogLevel,
  scope: string,
  message: string,
  detail: unknown[],
  sink: { enqueue(record: LogRecord): void },
): void {
  const safe = redactRecord({
    at: new Date().toISOString(),
    level,
    scope,
    message,
    detail: detail.length ? detail.map((d) => errorDetail(d)).join("\n") : undefined,
  });
  logBuffer.push(safe);
  try {
    sink.enqueue(safe);
  } catch {
    // Diagnostics must never become the reason a financial operation fails.
  }
}

export type Log = ReturnType<typeof createLogger>;

/** A named logger. Scope shows up in the console prefix and in Diagnostics. */
export function createLogger(
  scope: string,
  sink: { enqueue(record: LogRecord): void } = persistentLog,
) {
  // loglevel BINDS the real console method rather than wrapping it, which is the
  // reason it earns a dependency: devtools keeps reporting the call site instead
  // of pointing every line back at this file.
  const l = loglevel.getLogger(scope);
  return {
    debug: (message: string, ...detail: unknown[]) => {
      record("debug", scope, message, detail, sink);
      l.debug(message, ...detail);
    },
    info: (message: string, ...detail: unknown[]) => {
      record("info", scope, message, detail, sink);
      l.info(message, ...detail);
    },
    warn: (message: string, ...detail: unknown[]) => {
      record("warn", scope, message, detail, sink);
      l.warn(message, ...detail);
    },
    error: (message: string, ...detail: unknown[]) => {
      record("error", scope, message, detail, sink);
      l.error(message, ...detail);
    },
    /**
     * Log a caught throwable with context. Returns the one-line description, so a
     * caller can hand the same words to the user that went into the log — the two
     * should never disagree when someone is trying to match a toast to a record.
     */
    capture: (message: string, err: unknown): string => {
      const summary = describeError(err);
      record("error", scope, `${message}: ${summary}`, [err], sink);
      l.error(`${message}: ${summary}`, err);
      return summary;
    },
  };
}

export type { LogLevel, LogRecord };

/**
 * The facts that a statically-exported build CANNOT know, because it runs in
 * Node on a build machine with no `navigator` and its own time zone.
 *
 * They are not slow or async — the browser has them on its very first render.
 * The problem is that the prerendered HTML does not, so a first render that
 * shows them disagrees with the markup React is hydrating and React reports a
 * mismatch. Blank them for that one render, then let the real values in.
 */
export const BROWSER_ONLY_FACTS: ReadonlySet<string> = new Set([
  "user agent",
  "language",
  "time zone",
]);

/**
 * The same facts as the build machine would have rendered them. Only the keys
 * in `BROWSER_ONLY_FACTS` are blanked, so a fact that is legitimately absent
 * keeps whatever it already was and a genuine mismatch anywhere else still
 * warns.
 */
export function withoutBrowserFacts(
  facts: Record<string, string | number | null>,
): Record<string, string | number | null> {
  return Object.fromEntries(
    Object.entries(facts).map(([key, value]) => [
      key,
      BROWSER_ONLY_FACTS.has(key) ? null : value,
    ]),
  );
}

/**
 * The whole diagnostic picture as one pasteable block: the facts about this
 * install, then the log tail. `facts` is passed in rather than read here — the
 * repo, auth and sync state live above this layer.
 */
export function buildDiagnostics(
  facts: Record<string, string | number | null>,
  records: LogRecord[] = logBuffer.records(),
): string {
  const header = Object.entries(facts)
    .map(([k, v]) => `${k}: ${v ?? "—"}`)
    .join("\n");
  return `yaccount diagnostics\n${"=".repeat(40)}\n${header}\n\nLog (oldest first)\n${"-".repeat(40)}\n${logRecordsToText(records)}\n`;
}
