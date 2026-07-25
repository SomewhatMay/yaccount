import type { DriveFS } from "./checkpointer";

/**
 * An in-memory `DriveFS` for tests — the whole point of keeping the checkpointer
 * pure (impl §5). Shared by every sync suite so there is ONE definition of how
 * Drive is assumed to behave; a fake that drifts per file is a fake that proves
 * nothing. Test-only: nothing in the app imports it, so it never ships.
 */
export class FakeDriveFS implements DriveFS {
  files = new Map<string, string>();
  /** When true, `list("")` throws like a fresh account with no root folder yet. */
  listThrows = false;
  /**
   * When true EVERY call rejects, the way a real Drive behaves with the network
   * down. Distinct from `listThrows`/a 404: the point of this switch is that the
   * store cannot answer *any* question, so nothing may be inferred from silence.
   */
  offline = false;
  /** Path prefixes whose next write/delete should fail — for crash-point tests. */
  failOn: ((path: string, op: "write" | "delete" | "append") => boolean) | null = null;

  private guard(path: string, op: "write" | "delete" | "append"): void {
    if (this.failOn?.(path, op))
      throw new Error(`simulated Drive failure on ${op} ${path}`);
  }

  private online(op: string): void {
    if (this.offline) throw new Error(`network unreachable during ${op}`);
  }

  async read(path: string): Promise<string> {
    this.online(`read ${path}`);
    const v = this.files.get(path);
    if (v === undefined) throw new Error(`404 ${path}`);
    return v;
  }
  async write(path: string, content: string): Promise<void> {
    this.online(`write ${path}`);
    this.guard(path, "write");
    this.files.set(path, content);
  }
  async append(path: string, content: string): Promise<void> {
    this.online(`append ${path}`);
    this.guard(path, "append");
    this.files.set(path, (this.files.get(path) ?? "") + content);
  }
  async exists(path: string): Promise<boolean> {
    this.online(`exists ${path}`);
    return this.files.has(path);
  }
  async delete(path: string): Promise<void> {
    this.online(`delete ${path}`);
    this.guard(path, "delete");
    if (!this.files.has(path)) throw new Error(`404 ${path}`);
    this.files.delete(path);
  }
  async list(): Promise<{ name: string; type: "file" | "directory" }[]> {
    this.online("list");
    if (this.listThrows) throw new Error("404 root");
    return [...this.files.keys()].map((name) => ({ name, type: "file" as const }));
  }
}
