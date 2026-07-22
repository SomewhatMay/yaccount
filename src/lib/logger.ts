import loglevel from "loglevel";
import { LogBuffer, type LogLevel, type LogRecord } from "./log-buffer";
import { describeError, errorDetail } from "./errors";

/**
 * Application logging.
 *
 * `loglevel` gives us levels, named loggers and a persisted setting, and — the
 * reason it is worth a dependency — it binds the real `console` method rather
 * than wrapping it, so devtools still reports the CALL SITE instead of pointing
 * every line back at this file.
 *
 * On top of it we tee every record into a bounded in-memory buffer. yaccount has
 * no server, so a bug report is whatever the user can copy off their own screen;
 * the Diagnostics panel reads that buffer.
 */

/** The last few hundred records, for Diagnostics. Redacts on the way in. */
export const logBuffer = new LogBuffer(300);

const LEVELS: Record<number, LogLevel> = {
  0: "trace",
  1: "debug",
  2: "info",
  3: "warn",
  4: "error",
};

// Verbose while developing, quiet in a build. This governs the CONSOLE only.
const DEFAULT_LEVEL: LogLevel = process.env.NODE_ENV === "development" ? "debug" : "info";
loglevel.setDefaultLevel(DEFAULT_LEVEL);

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
): void {
  logBuffer.push({
    at: new Date().toISOString(),
    level,
    scope,
    message,
    detail: detail.length ? detail.map((d) => errorDetail(d)).join("\n") : undefined,
  });
}

export type Log = ReturnType<typeof createLogger>;

/** A named logger. Scope shows up in the console prefix and in Diagnostics. */
export function createLogger(scope: string) {
  // loglevel BINDS the real console method rather than wrapping it, which is the
  // reason it earns a dependency: devtools keeps reporting the call site instead
  // of pointing every line back at this file.
  const l = loglevel.getLogger(scope);
  return {
    debug: (message: string, ...detail: unknown[]) => {
      record("debug", scope, message, detail);
      l.debug(message, ...detail);
    },
    info: (message: string, ...detail: unknown[]) => {
      record("info", scope, message, detail);
      l.info(message, ...detail);
    },
    warn: (message: string, ...detail: unknown[]) => {
      record("warn", scope, message, detail);
      l.warn(message, ...detail);
    },
    error: (message: string, ...detail: unknown[]) => {
      record("error", scope, message, detail);
      l.error(message, ...detail);
    },
    /**
     * Log a caught throwable with context. Returns the one-line description, so a
     * caller can hand the same words to the user that went into the log — the two
     * should never disagree when someone is trying to match a toast to a record.
     */
    capture: (message: string, err: unknown): string => {
      const summary = describeError(err);
      record("error", scope, `${message}: ${summary}`, [err]);
      l.error(`${message}: ${summary}`, err);
      return summary;
    },
  };
}

/**
 * The level is external state (loglevel owns it, persisted in localStorage), so
 * it is exposed as a subscribable store rather than mirrored into React state.
 * That lets the settings UI read it with `useSyncExternalStore` — which handles
 * the server/client split explicitly instead of hydrating with the wrong value.
 */
const levelListeners = new Set<() => void>();

/** The value rendered before hydration, when localStorage cannot be read. */
export const SSR_LOG_LEVEL: LogLevel = DEFAULT_LEVEL;

export function subscribeLogLevel(onChange: () => void): () => void {
  levelListeners.add(onChange);
  return () => {
    levelListeners.delete(onChange);
  };
}

/** Raise or lower verbosity at runtime; persisted by loglevel to localStorage. */
export function setLogLevel(level: LogLevel): void {
  loglevel.setLevel(level, true);
  for (const notify of levelListeners) notify();
}

export function getLogLevel(): LogLevel {
  return LEVELS[loglevel.getLevel()] ?? DEFAULT_LEVEL;
}

export type { LogLevel, LogRecord };

/**
 * The whole diagnostic picture as one pasteable block: the facts about this
 * install, then the log tail. `facts` is passed in rather than read here — the
 * repo, auth and sync state live above this layer.
 */
export function buildDiagnostics(facts: Record<string, string | number | null>): string {
  const header = Object.entries(facts)
    .map(([k, v]) => `${k}: ${v ?? "—"}`)
    .join("\n");
  return `yaccount diagnostics\n${"=".repeat(40)}\n${header}\n\nLog (oldest first)\n${"-".repeat(40)}\n${logBuffer.toText()}\n`;
}
