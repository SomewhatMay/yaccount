import { isHandled } from "./errors";

interface CaptureLogger {
  capture(message: string, error: unknown): unknown;
}

/** Non-actionable background failures are retained locally, not toasted. */
export function reportUnhandledError(
  log: CaptureLogger,
  error: unknown,
  kind: string,
): void {
  if (!isHandled(error)) log.capture(kind, error);
}
