/**
 * "Take me to this exact row", as a URL.
 *
 * `ledger/deep-link.ts` has carried a `focus` param since M11, bundled with the
 * register's filter params. Search results need the same gesture on Categories,
 * Containers, Goals and Recurring — none of which have filters worth encoding —
 * so the plain half lives here and all five screens spell it the same way.
 *
 * The param is stripped by the receiving view once it has scrolled (as
 * `LedgerView` does), so a focus never sticks to the address bar and a refresh
 * does not re-flash a row you have already found.
 */

/** The screen, pointed at one row. An empty id is just the screen. */
export function focusHref(path: string, id: string): string {
  if (id === "") return path;
  return `${path}?focus=${encodeURIComponent(id)}`;
}

/** The row a query string names, or null. */
export function readFocus(search: string): string | null {
  const focus = new URLSearchParams(search).get("focus");
  return focus === null || focus === "" ? null : focus;
}
