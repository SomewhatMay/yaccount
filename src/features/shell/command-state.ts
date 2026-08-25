/** The blank palette reads only its small action catalog. Build the ledger-wide
 * index once the user supplies a real query, never just because the dialog opens. */
export function needsCommandIndex(open: boolean, query: string): boolean {
  return open && query.trim() !== "";
}
