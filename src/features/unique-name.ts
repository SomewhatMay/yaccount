/**
 * Names are UNIQUE for categories (§5.1) and containers (§5.2). IndexedDB can't
 * express that, and a hard constraint would be wrong anyway — a merge must never
 * throw — so it is a UI-level check on both create AND rename, compared
 * case-insensitively on the trimmed name. Pass `selfId` when renaming so a row
 * doesn't collide with itself.
 */
export function nameTaken(
  items: { id: string; name: string }[],
  candidate: string,
  selfId?: string,
): boolean {
  // NFC-normalize: "Café" typed on macOS (decomposed) and pasted from the web
  // (composed) look identical to the user and must collide.
  const key = (s: string) => s.trim().normalize("NFC").toLowerCase();
  const wanted = key(candidate);
  if (wanted.length === 0) return false; // emptiness is the caller's error
  return items.some((i) => i.id !== selfId && key(i.name) === wanted);
}
