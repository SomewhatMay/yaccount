import type { DriveFS } from "./checkpointer";
import { ORIGIN_PATH } from "./paths";

/**
 * Why a store was reset. Purely informational — every kind behaves identically —
 * but it is what lets the UI say "cleared on 25 July" instead of "changed".
 */
export type ResetKind = "clear" | "import" | "restore";

/**
 * The generation marker on Drive (phase 5).
 *
 * The problem it solves: `drivestore` gives us no way to tell "this account was
 * deliberately emptied" from "this is a brand-new Google account". A device that
 * was offline through a clear would otherwise reconnect, see nothing remote,
 * keep its stale world forever, and eventually push it back — resurrecting data
 * the user explicitly discarded. A monotonic `resetId` written on every
 * clear/import/restore makes the two cases distinguishable.
 */
export interface Origin {
  v: 1;
  /** Opaque id of the current generation. A change means "adopt a new world". */
  resetId: string;
  resetAt: string;
  kind: ResetKind;
}

export function serializeOrigin(origin: Origin): string {
  return JSON.stringify(origin);
}

/** Tolerant parse: a corrupt marker must read as "no marker", never throw. A
 * device that can't understand the generation simply syncs the way it always
 * did, which is the safe direction — it merges rather than discards. */
export function parseOrigin(text: string): Origin | null {
  try {
    const parsed = JSON.parse(text) as Partial<Origin>;
    if (!parsed || typeof parsed.resetId !== "string" || parsed.resetId === "")
      return null;
    return {
      v: 1,
      resetId: parsed.resetId,
      resetAt: typeof parsed.resetAt === "string" ? parsed.resetAt : "",
      kind:
        parsed.kind === "import" || parsed.kind === "restore" || parsed.kind === "clear"
          ? parsed.kind
          : "clear",
    };
  } catch {
    return null;
  }
}

/**
 * What we managed to learn about the store's generation.
 *
 * The distinction between the last two is the whole point. Collapsing them —
 * treating a failed request as "there is no marker" — is what let an offline
 * device forget the generation it held and then adopt all over again the moment
 * the network returned, setting its data aside on every reconnect. A store that
 * cannot answer must not be quoted as having answered "nothing".
 */
export type OriginRead =
  | { status: "present"; origin: Origin }
  /** Positively confirmed to not exist: a fresh store, or one predating phase 5. */
  | { status: "absent" }
  /** Could not be determined — offline, 5xx, an expired token. Infer nothing. */
  | { status: "unknown" };

/**
 * Read the generation marker, distinguishing "not there" from "couldn't tell".
 *
 * `read` rejecting is ambiguous on its own, so a failure is followed by an
 * `exists` probe: a store that is merely missing the file answers `false`
 * cheaply, while an unreachable one fails that question too. This deliberately
 * avoids inspecting drivestore's error shape — that knowledge is confined to
 * `src/sync/drive.ts`, and `exists` is already part of the `DriveFS` seam.
 */
export async function readOrigin(fs: DriveFS): Promise<OriginRead> {
  let text: string;
  try {
    text = await fs.read(ORIGIN_PATH);
  } catch {
    try {
      // Present but unreadable is still "cannot tell" — never "absent".
      return (await fs.exists(ORIGIN_PATH))
        ? { status: "unknown" }
        : { status: "absent" };
    } catch {
      return { status: "unknown" };
    }
  }
  const origin = parseOrigin(text);
  return origin ? { status: "present", origin } : { status: "absent" };
}
