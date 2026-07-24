/**
 * The in-memory tail of the log.
 *
 * yaccount has no server, so there is nowhere to ship logs to — which means a
 * bug report is whatever the user can copy off their own screen. This keeps the
 * last N records so the Diagnostics panel always has something concrete to hand
 * over, instead of asking someone to reproduce the problem with devtools open.
 *
 * Pure: no console, no storage, no browser APIs. `logger.ts` does the wiring.
 */

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

export interface LogRecord {
  at: string; // ISO instant
  level: LogLevel;
  scope: string; // "repo" | "sync" | "ui" | …
  message: string;
  detail?: string;
}

/**
 * Anything that could identify or authenticate the user, stripped BEFORE it is
 * stored — so a secret is never sitting in memory waiting to be copied, and the
 * panel needs no scrubbing of its own. The order matters: token shapes are
 * matched before the generic email pattern.
 *
 * Deliberately NOT redacted: the device id. It is the user's own, it appears all
 * over the sync protocol (§8.4), and a per-device sync bug is undiagnosable
 * without it.
 */
const REDACTIONS: [RegExp, string][] = [
  // Google OAuth access tokens.
  [/\bya29\.[\w.\-]+/g, "[redacted-token]"],
  // Anything JWT-shaped (id tokens).
  [/\bey[\w-]{8,}\.[\w-]{8,}\.[\w-]+/g, "[redacted-jwt]"],
  // `"access_token": "…"`, `refresh_token=…`, and friends, in a JSON body or query.
  [/\b((?:access|refresh|id)_token"?\s*[:=]\s*"?)[\w.~+/=-]+/gi, "$1[redacted]"],
  // `Authorization: Bearer …`
  [/\b(bearer\s+)[\w.~+/=-]+/gi, "$1[redacted]"],
  [/\b[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, "[redacted-email]"],
];

/** Strip credentials and personal identifiers from free text. */
export function redact(text: string): string {
  let out = text;
  for (const [pattern, replacement] of REDACTIONS)
    out = out.replace(pattern, replacement);
  return out;
}

const PAD: Record<LogLevel, string> = {
  trace: "TRACE",
  debug: "DEBUG",
  info: "INFO ",
  warn: "WARN ",
  error: "ERROR",
};

export class LogBuffer {
  private readonly capacity: number;
  private records_: LogRecord[] = [];

  constructor(capacity = 300) {
    this.capacity = Math.max(1, Math.floor(capacity));
  }

  /** Append one record, redacted, evicting the oldest once full. */
  push(record: LogRecord): void {
    this.records_.push({
      ...record,
      message: redact(record.message),
      detail: record.detail === undefined ? undefined : redact(record.detail),
    });
    if (this.records_.length > this.capacity) {
      this.records_.splice(0, this.records_.length - this.capacity);
    }
  }

  /** A copy — the log is a record of what happened, not a mutable list. */
  records(): LogRecord[] {
    return [...this.records_];
  }

  clear(): void {
    this.records_ = [];
  }

  /** Oldest first, one record per line, ready to paste into an issue. */
  toText(): string {
    if (this.records_.length === 0) return "(no log records yet)";
    return this.records_
      .map((r) => {
        const head = `${r.at}  ${PAD[r.level]}  [${r.scope}]  ${r.message}`;
        return r.detail ? `${head}\n${indent(r.detail)}` : head;
      })
      .join("\n");
  }
}

function indent(text: string): string {
  return text
    .split("\n")
    .map((line) => `        ${line}`)
    .join("\n");
}
