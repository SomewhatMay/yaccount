/**
 * Turning whatever was thrown into something a person can act on.
 *
 * A browser app throws all sorts: real `Error`s, DOM exceptions, drivestore's
 * `DriveError` (`.status`/`.body`), a bare string, occasionally `undefined`. None
 * of it is useful to the user unless something normalizes it first — and "we
 * couldn't complete that" with no detail is what makes a bug unreportable.
 *
 * Pure and dependency-free by design: this sits under `src/lib`, so it must not
 * import the sync seam. `DriveError` is therefore read STRUCTURALLY here — a
 * Drive failure is the single most likely thing a user will ever paste at us, so
 * it has to read well even from a layer that has never heard of drivestore.
 */

/** The longest detail we will put in front of a user; a Drive body can be huge. */
const MAX_DETAIL = 300;

interface ErrorLike {
  name?: unknown;
  message?: unknown;
  status?: unknown;
  body?: unknown;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** One line, safe to put in a toast: what went wrong, as specifically as we know. */
export function describeError(err: unknown): string {
  if (typeof err === "string" && err.trim()) return err.trim();

  if (err !== null && typeof err === "object") {
    const e = err as ErrorLike;
    const status = typeof e.status === "number" ? e.status : null;
    const message = str(e.message).trim();
    const body = str(e.body).trim();

    if (status !== null) {
      // DriveError shape (§4) — status is the diagnostic, body is the reason.
      const detail = (body || message).slice(0, MAX_DETAIL);
      return `HTTP ${status}${detail ? `: ${detail}` : ""}`;
    }
    if (message) return message.slice(0, MAX_DETAIL);
    if (err instanceof Error && err.name) return err.name;
    const named = str(e.name).trim();
    if (named) return named;
  }

  if (err === null || err === undefined) return "Unknown error";
  const text = String(err).trim();
  return text && text !== "[object Object]" ? text.slice(0, MAX_DETAIL) : "Unknown error";
}

/** The verbose version for the log: stack, and any cause chain under it. */
export function errorDetail(err: unknown, depth = 0): string {
  if (depth > 4) return "…";
  if (err instanceof Error) {
    const head = err.stack || `${err.name}: ${err.message}`;
    const cause = (err as { cause?: unknown }).cause;
    return cause === undefined || cause === null
      ? head
      : `${head}\ncaused by: ${errorDetail(cause, depth + 1)}`;
  }
  try {
    return JSON.stringify(err) ?? String(err);
  } catch {
    // circular, or a getter that throws — the shape is still worth something
    return String(err);
  }
}

/**
 * Errors that have ALREADY been reported to the user.
 *
 * A failed write is logged and toasted at the store seam, then rethrown so the
 * caller doesn't run its success path (resetting a form, showing "Logged"). The
 * rethrow lands in the global handler, which must stay quiet about it — one
 * mistake, one message. Kept on a shared symbol so it neither shows up in
 * `Object.keys` nor survives into JSON.
 */
const HANDLED = Symbol.for("yaccount.handled");

export function markHandled<T>(err: T): T {
  if (err !== null && typeof err === "object") {
    Object.defineProperty(err, HANDLED, {
      value: true,
      enumerable: false,
      configurable: true,
    });
  }
  return err;
}

export function isHandled(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === "object" &&
    (err as Record<symbol, unknown>)[HANDLED] === true
  );
}
