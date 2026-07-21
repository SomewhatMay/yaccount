import { z } from "zod";
import { zId, zIsoDate, zCents, newId } from "./primitives";

/** §5.6 container_snapshots — real-world reported value of an investment container.
 * Market growth is never a transaction; it lives only in these snapshots. */
export const ContainerSnapshotSchema = z.object({
  id: zId,
  container_id: zId,
  date: zIsoDate,
  reported_balance: zCents, // integer cents; signed (an account could report negative)
});
export type ContainerSnapshot = z.infer<typeof ContainerSnapshotSchema>;

/** Log a container's real-world reported value on a date (§5.6). Snapshots
 * accumulate — each report is a new row, never an overwrite of the last. */
export function makeContainerSnapshot(input: {
  container_id: string;
  date: string;
  reported_balance: number; // integer cents
  id?: string;
}): ContainerSnapshot {
  return ContainerSnapshotSchema.parse({
    id: input.id ?? newId(),
    container_id: input.container_id,
    date: input.date,
    reported_balance: input.reported_balance,
  });
}
