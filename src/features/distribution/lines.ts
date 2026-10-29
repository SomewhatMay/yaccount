import type { Container, DistributionPreset, Transaction } from "@/core/model";
import { restBps, BPS_WHOLE } from "@/core/model";
import { groupBreakdown, type SplitResult } from "@/core/engine/distribution";
import { formatBps, formatShare } from "./format";

/** One line of a split, ready to print: who, what share, how much. */
export interface SplitLine {
  containerId: string;
  name: string;
  share: string;
  amount: number;
  rest: boolean;
}

const nameOf = (containers: Container[], id: string) =>
  containers.find((c) => c.id === id)?.name ?? "Unknown";

/**
 * A split that hasn't been written yet (compose, the Plan preview, an Inbox
 * row): shares in the preset's own terms. Every part is listed — one that
 * rounds to 0¢ shows $0.00 rather than silently vanishing — except a part whose
 * container can't take money, which the note explains instead.
 */
export function linesFromSplit(
  split: Extract<SplitResult, { ok: true }>,
  preset: DistributionPreset,
  containers: Container[],
): { lines: SplitLine[]; note: string | null } {
  const folded = new Set(split.folded);
  const lines: SplitLine[] = [];
  let foldedBps = 0;
  for (const part of preset.parts) {
    if (folded.has(part.container_id)) {
      foldedBps += part.bps;
      continue;
    }
    const piece = split.pieces.find((p) => p.container_id === part.container_id);
    lines.push({
      containerId: part.container_id,
      name: nameOf(containers, part.container_id),
      share: formatBps(part.bps),
      amount: piece?.amount ?? 0,
      rest: false,
    });
  }
  const restName = nameOf(containers, split.rest.container_id);
  lines.push({
    containerId: split.rest.container_id,
    name: restName,
    share: `${formatBps(Math.min(BPS_WHOLE, restBps(preset) + foldedBps))} rest`,
    amount: split.rest.amount,
    rest: true,
  });
  const foldedNames = split.folded.map((id) =>
    containers.some((c) => c.id === id) ? nameOf(containers, id) : "A removed container",
  );
  const note =
    foldedNames.length === 0
      ? null
      : `${foldedNames.join(", ")} ${foldedNames.length === 1 ? "is" : "are"} archived — ${
          foldedNames.length === 1 ? "its share stays" : "their shares stay"
        } in ${restName}.`;
  return { lines, note };
}

/** A split already in the ledger: shares derived from the cents themselves. */
export function linesFromGroup(
  parent: Transaction,
  pieces: Transaction[],
  containers: Container[],
): SplitLine[] {
  return groupBreakdown(parent, pieces).map((line) => ({
    containerId: line.container_id,
    name: nameOf(containers, line.container_id),
    share: `${formatShare(line.share)}${line.rest ? " rest" : ""}`,
    amount: line.amount,
    rest: line.rest,
  }));
}
