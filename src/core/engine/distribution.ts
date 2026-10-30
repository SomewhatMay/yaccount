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
import {
  constrains,
  matchesFilter,
  type FilterContext,
  type TransactionFilter,
} from "./filter";
import {
  activeRows,
  distributionPieces,
  hideDistributionPieces,
  sortForRegister,
} from "./ledger";

export { distributionPieces, hideDistributionPieces };

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

/** The first of `ids` that names a preset able to split right now. */
export function firstUsablePreset(
  ids: (string | null | undefined)[],
  presets: DistributionPreset[],
  containers: Container[],
): string | null {
  for (const id of ids) {
    const preset = usablePreset(id, presets, containers);
    if (preset) return preset.id;
  }
  return null;
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
 * The register through a filter, with splits folded in. A parent is on screen
 * when it matches by itself OR when one of its pieces does — and then
 * `highlights` names the container lines that matched, so the row can show its
 * split inline and say why it's in the list:
 *
 * - a piece matches by its DESTINATION (the money that landed there); its
 *   source leg is the parent's own container, which the parent answers for;
 * - when the parent matches by itself, only a container facet lights lines (the
 *   rest line, and any part the facet names) — a payee search that the parent
 *   already satisfies stays a compact row.
 */
export function filterRegister(
  liveRows: Transaction[],
  filter: TransactionFilter,
  ctx: FilterContext = {},
): { rows: Transaction[]; highlights: Map<string, Set<string>> } {
  const pieces = distributionPieces(liveRows);
  const containerFacet = constrains(filter.containerIds);
  const rows: Transaction[] = [];
  const highlights = new Map<string, Set<string>>();
  for (const row of hideDistributionPieces(liveRows)) {
    const self = matchesFilter(row, filter, ctx);
    const own = pieces.get(row.id) ?? [];
    const lit = new Set<string>();
    if (own.length > 0 && (!self || containerFacet)) {
      if (self && filter.containerIds!.includes(row.container_id))
        lit.add(row.container_id);
      for (const p of own) {
        // Both legs read as the destination, so only where it LANDED can match.
        const landed = { ...p, container_id: p.to_container_id! };
        if (matchesFilter(landed, filter, ctx)) lit.add(p.to_container_id!);
      }
    }
    if (!self && lit.size === 0) continue;
    rows.push(row);
    if (lit.size > 0) highlights.set(row.id, lit);
  }
  return { rows, highlights };
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
  return breakdownOf(
    parent.amount,
    parent.container_id,
    pieces.map((p) => ({ container_id: p.to_container_id!, amount: Math.abs(p.amount) })),
  );
}

/** `groupBreakdown` for pieces not written yet: gross, rest container, cents. */
export function breakdownOf(
  gross: number,
  restContainerId: string,
  pieces: { container_id: string; amount: number }[],
): BreakdownLine[] {
  const byContainer = new Map<string, number>();
  for (const p of pieces) {
    byContainer.set(p.container_id, (byContainer.get(p.container_id) ?? 0) + p.amount);
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
    container_id: restContainerId,
    amount: gross - given,
    share: share(gross - given),
    rest: true,
  });
  return lines;
}

/**
 * Whether a written split is what its preset would write on the same amount
 * today. False once a share, the rest or a part's container changed since —
 * and for a preset that can't split at all.
 */
export function splitMatchesPreset(
  parent: Transaction,
  pieces: Transaction[],
  preset: DistributionPreset,
  containers: Container[],
): boolean {
  const split = splitIncome(parent.amount, preset, containers);
  if (!split.ok || split.rest.container_id !== parent.container_id) return false;
  const written = groupBreakdown(parent, pieces).filter((l) => !l.rest);
  return (
    written.length === split.pieces.length &&
    split.pieces.every((p) =>
      written.some((l) => l.container_id === p.container_id && l.amount === p.amount),
    )
  );
}

/**
 * A written split moved to a new amount at its own shares: each piece keeps
 * `floor(piece × to / from)` (BigInt), so the pieces never exceed `to` and the
 * rest takes every leftover cent. Pieces that floor to 0¢ drop out.
 */
export function scaleSplit(
  pieces: { container_id: string; amount: number }[],
  from: number,
  to: number,
): { container_id: string; amount: number }[] {
  if (from <= 0 || to <= 0) return [];
  return pieces
    .map((p) => ({
      container_id: p.container_id,
      amount: Number((BigInt(p.amount) * BigInt(to)) / BigInt(from)),
    }))
    .filter((p) => p.amount > 0);
}

// ── Plan helpers ─────────────────────────────────────────────────────────────

/**
 * Seed a preset's parts from the month's goal asks: each goal container gets
 * `ask ÷ expected income`, floored to a basis point (never down to 0 for a
 * real ask). Asks into the rest container are already "the rest".
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
  const asked = [...byContainer.values()].reduce((sum, a) => sum + a, 0);
  if (asked > input.income) return { ok: false, reason: "over-income" };
  // Floored, like the split itself, so asks that exactly use the income still
  // fit in 100% — the rest absorbs the fractions. A real ask never rounds to 0%.
  const parts = [...byContainer.entries()].map(([container_id, amount]) => ({
    container_id,
    bps: Math.max(1, Math.floor((amount * BPS_WHOLE) / input.income)),
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
