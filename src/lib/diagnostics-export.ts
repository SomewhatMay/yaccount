import type { LogRecord } from "./log-buffer";
import { buildDiagnostics, logBuffer } from "./logger";
import { MAX_LOG_RECORDS, persistentLog } from "./persistent-log";

export interface DiagnosticsFile {
  name: string;
  type: "text/plain;charset=utf-8";
  text: string;
}

export function createDiagnosticsFile(text: string, now = new Date()): DiagnosticsFile {
  const stamp = now
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replaceAll(":", "-");
  return {
    name: `yaccount-diagnostics-${stamp}.txt`,
    type: "text/plain;charset=utf-8",
    text,
  };
}

const recordKey = (record: LogRecord): string =>
  JSON.stringify([record.at, record.level, record.scope, record.message, record.detail]);

/** Join the persisted history to the current memory tail without duplicating overlap. */
export function mergeLogRecords(
  persisted: LogRecord[],
  memory: LogRecord[],
): LogRecord[] {
  const unmatched = new Map<string, number>();
  for (const record of persisted) {
    const key = recordKey(record);
    unmatched.set(key, (unmatched.get(key) ?? 0) + 1);
  }
  const missing = memory.filter((record) => {
    const key = recordKey(record);
    const count = unmatched.get(key) ?? 0;
    if (count === 0) return true;
    unmatched.set(key, count - 1);
    return false;
  });
  return [...persisted, ...missing]
    .sort((left, right) => left.at.localeCompare(right.at))
    .slice(-MAX_LOG_RECORDS);
}

export async function readDiagnosticsRecords(): Promise<LogRecord[]> {
  const persisted = await persistentLog.readAll();
  return mergeLogRecords(persisted, logBuffer.records());
}

export async function collectDiagnostics(
  facts: Record<string, string | number | null>,
): Promise<string> {
  return buildDiagnostics(facts, await readDiagnosticsRecords());
}

export async function clearDiagnostics(): Promise<void> {
  logBuffer.clear();
  await persistentLog.clear();
}

export function triggerDiagnosticsDownload(file: DiagnosticsFile): void {
  const url = URL.createObjectURL(new Blob([file.text], { type: file.type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function downloadDiagnostics(
  facts: Record<string, string | number | null>,
): Promise<void> {
  triggerDiagnosticsDownload(createDiagnosticsFile(await collectDiagnostics(facts)));
}
