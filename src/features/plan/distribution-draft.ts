import {
  BPS_WHOLE,
  makeDistributionPreset,
  newId,
  type Container,
  type DistributionPreset,
} from "@/core/model";
import { splitIncome } from "@/core/engine/distribution";
import { formatBps, parsePercent } from "@/features/distribution/format";
import { linesFromSplit, type SplitLine } from "@/features/distribution/lines";

/**
 * The preset editor's form state and its one rule for "is this saveable"
 * (plans/income-distribution.md). Pure, so the Plan sheet stays a view.
 */
export interface PresetDraft {
  name: string;
  restId: string;
  parts: { containerId: string; pct: string }[];
  isDefault: boolean;
}

export function emptyDraft(restId: string): PresetDraft {
  return { name: "", restId, parts: [], isDefault: false };
}

export function draftFromPreset(
  preset: DistributionPreset,
  isDefault: boolean,
): PresetDraft {
  return {
    name: preset.name,
    restId: preset.rest_container_id,
    parts: preset.parts.map((p) => ({
      containerId: p.container_id,
      pct: formatBps(p.bps).replace(/%$/, ""),
    })),
    isDefault,
  };
}

export interface DraftEvaluation {
  errors: { name?: string; rest?: string; total?: string; parts: Record<string, string> };
  warnings: string[];
  totalBps: number;
  restBps: number;
  /** Per-part bps as parsed (0 when unparseable) — for the row's live amount. */
  partBps: Record<string, number>;
  preview: { lines: SplitLine[]; total: number; note: string | null } | null;
  /** Set only when the draft can be saved. */
  preset: DistributionPreset | null;
}

const nameOf = (containers: Container[], id: string) =>
  containers.find((c) => c.id === id)?.name ?? "That container";

export function evaluateDraft(
  draft: PresetDraft,
  ctx: {
    presets: DistributionPreset[];
    editingId: string | null;
    containers: Container[];
    previewCents: number;
  },
): DraftEvaluation {
  const errors: DraftEvaluation["errors"] = { parts: {} };
  const warnings: string[] = [];
  const partBps: Record<string, number> = {};
  const name = draft.name.trim();

  if (!name) errors.name = "Name it.";
  else {
    const clash = ctx.presets.find(
      (p) =>
        p.id !== ctx.editingId &&
        p.name.localeCompare(name, undefined, { sensitivity: "base" }) === 0,
    );
    if (clash) errors.name = `A distribution called ${clash.name} already exists.`;
  }

  const rest = ctx.containers.find((c) => c.id === draft.restId);
  if (!rest || rest.is_archived) {
    errors.rest = `${rest?.name ?? "That container"} is archived — pick where the rest goes.`;
  }

  const parts: { container_id: string; bps: number }[] = [];
  for (const part of draft.parts) {
    if (part.containerId === draft.restId) continue; // the rest takes it anyway
    const parsed = parsePercent(part.pct);
    if (!parsed.ok) {
      errors.parts[part.containerId] = parsed.error;
      partBps[part.containerId] = 0;
      continue;
    }
    partBps[part.containerId] = parsed.bps;
    parts.push({ container_id: part.containerId, bps: parsed.bps });
    const c = ctx.containers.find((x) => x.id === part.containerId);
    if (!c || c.is_archived) {
      warnings.push(
        `${nameOf(ctx.containers, part.containerId)} is archived — its share stays in ${rest?.name ?? "the rest"}.`,
      );
    }
  }

  const totalBps = Object.values(partBps).reduce((sum, bps) => sum + bps, 0);
  if (totalBps > BPS_WHOLE) {
    errors.total = `Over 100% by ${formatBps(totalBps - BPS_WHOLE)}.`;
  }

  const valid =
    !errors.name &&
    !errors.rest &&
    !errors.total &&
    Object.keys(errors.parts).length === 0;
  const preset = valid
    ? makeDistributionPreset({
        id: ctx.editingId ?? newId(),
        name,
        rest_container_id: draft.restId,
        parts,
      })
    : null;

  let preview: DraftEvaluation["preview"] = null;
  if (preset && ctx.previewCents > 0) {
    const split = splitIncome(ctx.previewCents, preset, ctx.containers);
    if (split.ok)
      preview = {
        total: ctx.previewCents,
        ...linesFromSplit(split, preset, ctx.containers),
      };
  }

  return {
    errors,
    warnings,
    totalBps,
    restBps: Math.max(0, BPS_WHOLE - totalBps),
    partBps,
    preview,
    preset,
  };
}
