import {
  BPS_WHOLE,
  DISTRIBUTION_DEFAULT_KEY,
  isDistributionKey,
  parseDistributionPreset,
  type Container,
  type DistributionPart,
  type DistributionPreset,
  type RecurringRule,
  type Setting,
  type Transaction,
} from "../model";
import { isTransfer } from "./balances";
import { activeRows, sortForRegister } from "./ledger";

/**
 * Income distribution (plans/income-distribution.md) — the pure half.
 *
 * A distributed income is ONE income row in the preset's rest container plus one
 * transfer per part (`rest → part`), each piece pointing at the income through
 * `distribution_parent_id`. Everything here either computes a split at write
 * time — after which the cents are frozen in the rows — or reads groups back out
 * of the rows. Nothing here re-derives a past split from a preset: presets
 * change, history does not.
 */

// ── The split ────────────────────────────────────────────────────────────────

export interface SplitPiece {
  container_id: string;
  bps: number;
  amount: number;
}

export type SplitResult =
  | {
      ok: true;
      rest: { container_id: string; amount: number };
      /** Non-zero pieces only, in the preset's order. */
      pieces: SplitPiece[];
      /** Parts that couldn't receive money (archived / missing container) and
       * whose share went to rest instead. */
      folded: string[];
    }
  | { ok: false; reason: "not-income" | "rest-unavailable" | "preset-archived" };

function liveContainer(containers: Container[], id: string): boolean {
  const c = containers.find((x) => x.id === id);
  return c !== undefined && !c.is_archived;
}

/**
 * Split `amount` cents by `preset`. Each part gets `floor(amount × bps / 10000)`
 * — BigInt, so no float rounding and no overflow at any safe-integer amount — and
 * the rest container gets everything left, rounding cents included. So the
 * pieces plus rest always equal `amount` exactly.
 */
export function splitIncome(
  amount: number,
  preset: DistributionPreset,
  containers: Container[],
): SplitResult {
  if (!Number.isSafeInteger(amount) || amount <= 0)
    return { ok: false, reason: "not-income" };
  if (preset.archived) return { ok: false, reason: "preset-archived" };
  if (!liveContainer(containers, preset.rest_container_id))
    return { ok: false, reason: "rest-unavailable" };

  const pieces: SplitPiece[] = [];
  const folded: string[] = [];
  let given = 0;
  for (const part of preset.parts) {
    if (!liveContainer(containers, part.container_id)) {
      folded.push(part.container_id);
      continue;
    }
    const share = Number((BigInt(amount) * BigInt(part.bps)) / BigInt(BPS_WHOLE));
    if (share === 0) continue;
    pieces.push({ container_id: part.container_id, bps: part.bps, amount: share });
    given += share;
  }
  return {
    ok: true,
    rest: { container_id: preset.rest_container_id, amount: amount - given },
    pieces,
    folded,
  };
}

// ── Presets ──────────────────────────────────────────────────────────────────

/** Every readable preset (archived included), by name. Junk values are skipped. */
export function listPresets(settings: Setting[]): DistributionPreset[] {
  const presets: DistributionPreset[] = [];
  for (const s of settings) {
    if (!isDistributionKey(s.key)) continue;
    const preset = parseDistributionPreset(s.value);
    if (preset) presets.push(preset);
  }
  return presets.sort(
    (a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) ||
      a.id.localeCompare(b.id),
  );
}

/** The default preset's id, only while it exists and is active. */
export function defaultPresetId(settings: Setting[]): string | null {
  const id = settings.find((s) => s.key === DISTRIBUTION_DEFAULT_KEY)?.value ?? "";
  if (!id) return null;
  const preset = listPresets(settings).find((p) => p.id === id);
  return preset && !preset.archived ? id : null;
}

/** Resolve an id to a preset that can split right now: active, rest usable. */
export function usablePreset(
  id: string | null | undefined,
  presets: DistributionPreset[],
  containers: Container[],
): DistributionPreset | null {
  if (!id) return null;
  const preset = presets.find((p) => p.id === id);
  if (!preset || preset.archived) return null;
  return liveContainer(containers, preset.rest_container_id) ? preset : null;
}

export interface PresetIssues {
  /** Parts whose container is archived or gone — their share goes to rest. */
  foldedParts: string[];
  /** The rest container is archived or gone — the preset can't split at all. */
  restUnavailable: boolean;
}

export function presetIssues(
  preset: DistributionPreset,
  containers: Container[],
): PresetIssues {
  return {
    foldedParts: preset.parts
      .filter((p) => !liveContainer(containers, p.container_id))
      .map((p) => p.container_id),
    restUnavailable: !liveContainer(containers, preset.rest_container_id),
  };
}

/**
 * What compose should default to for an income in `categoryId`: whatever the
 * category's last live income did. A split → that preset (if still usable); a
 * single container → not distributed. No history → the default preset.
 * Derived from the ledger, so it needs no setting of its own and follows the
 * user across devices for free.
 */
export function recallDistribution(
  txns: Transaction[],
  categoryId: string,
  presets: DistributionPreset[],
  containers: Container[],
  defaultId: string | null,
): string | null {
  const last = sortForRegister(
    activeRows(txns).filter(
      (t) => !isTransfer(t) && t.category_id === categoryId && t.amount > 0,
    ),
  )[0];
  const id = last ? last.distribution_preset_id : defaultId;
  return usablePreset(id, presets, containers)?.id ?? null;
}

// ── Groups, read back from the rows ──────────────────────────────────────────

/**
 * Live pieces keyed by their live parent's id. Pass LIVE rows (`activeRows`):
 * a voided piece is not part of its group any more, and a piece whose parent
 * isn't live (voided by an older client, or not synced yet) belongs to no group.
 */
export function distributionPieces(liveRows: Transaction[]): Map<string, Transaction[]> {
  const parents = new Set(liveRows.filter((t) => !isTransfer(t)).map((t) => t.id));
  const groups = new Map<string, Transaction[]>();
  for (const t of liveRows) {
    const parent = t.distribution_parent_id;
    if (!parent || !isTransfer(t) || !parents.has(parent)) continue;
    const list = groups.get(parent) ?? [];
    list.push(t);
    groups.set(parent, list);
  }
  return groups;
}

/**
 * The register's rows: a piece folds under its parent only while that parent is
 * on screen. A piece without a live parent is real money that still moved, so it
 * shows as the ordinary transfer it is — never silently vanishes.
 */
export function hideDistributionPieces(liveRows: Transaction[]): Transaction[] {
  const grouped = new Set(
    [...distributionPieces(liveRows).values()].flat().map((t) => t.id),
  );
  return liveRows.filter((t) => !grouped.has(t.id));
}

export interface BreakdownLine {
  container_id: string;
  amount: number;
  /** Fraction of the gross (0.2 = 20%). Derived from the cents, not the preset. */
  share: number;
  rest: boolean;
}

/**
 * What actually happened to an income: each piece (largest first), then the
 * rest — the parent's container keeps `gross − Σ pieces`. Read from the rows, so
 * after a preset edit, a drift from concurrent edits or a partial sync, it still
 * says exactly where the money is.
 */
export function groupBreakdown(
  parent: Transaction,
  pieces: Transaction[],
): BreakdownLine[] {
  const gross = parent.amount;
  const byContainer = new Map<string, number>();
  for (const p of pieces) {
    const to = p.to_container_id!;
    byContainer.set(to, (byContainer.get(to) ?? 0) + Math.abs(p.amount));
  }
  const share = (amount: number) => (gross === 0 ? 0 : amount / gross);
  const lines: BreakdownLine[] = [...byContainer.entries()]
    .map(([container_id, amount]) => ({
      container_id,
      amount,
      share: share(amount),
      rest: false,
    }))
    .sort((a, b) => b.amount - a.amount || a.container_id.localeCompare(b.container_id));
  const given = lines.reduce((sum, l) => sum + l.amount, 0);
  lines.push({
    container_id: parent.container_id,
    amount: gross - given,
    share: share(gross - given),
    rest: true,
  });
  return lines;
}

// ── Plan helpers ─────────────────────────────────────────────────────────────

/**
 * Seed a preset's parts from the month's goal asks: each goal container gets
 * `ask ÷ expected income`, rounded to the nearest basis point (never down to 0
 * for a real ask). Asks into the rest container are already "the rest".
 */
export function fillFromGoalAsks(input: {
  income: number;
  restContainerId: string;
  asks: { containerId: string; amount: number }[];
}):
  | { ok: true; parts: DistributionPart[] }
  | { ok: false; reason: "no-income" | "over-income" } {
  if (input.income <= 0) return { ok: false, reason: "no-income" };
  const byContainer = new Map<string, number>();
  for (const ask of input.asks) {
    if (ask.amount <= 0 || ask.containerId === input.restContainerId) continue;
    byContainer.set(
      ask.containerId,
      (byContainer.get(ask.containerId) ?? 0) + ask.amount,
    );
  }
  const parts = [...byContainer.entries()].map(([container_id, amount]) => ({
    container_id,
    bps: Math.max(1, Math.round((amount * BPS_WHOLE) / input.income)),
  }));
  if (parts.reduce((sum, p) => sum + p.bps, 0) > BPS_WHOLE)
    return { ok: false, reason: "over-income" };
  return { ok: true, parts };
}

/**
 * Active recurring transfers already feeding a part's container — so the user
 * can see a preset is about to double up on a standing auto-save.
 */
export function recurringOverlap(
  rules: RecurringRule[],
  containerIds: string[],
): Map<string, RecurringRule[]> {
  const wanted = new Set(containerIds);
  const overlap = new Map<string, RecurringRule[]>();
  for (const rule of rules) {
    const to = rule.template_to_container_id;
    if (rule.status !== "active" || to === null || !wanted.has(to)) continue;
    const list = overlap.get(to) ?? [];
    list.push(rule);
    overlap.set(to, list);
  }
  return overlap;
}
