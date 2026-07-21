import { z } from "zod";
import { zId, zIsoDate, zCents } from "./primitives";

/** §5.6 container_snapshots — real-world reported value of an investment container.
 * Market growth is never a transaction; it lives only in these snapshots. */
export const ContainerSnapshotSchema = z.object({
  id: zId,
  container_id: zId,
  date: zIsoDate,
  reported_balance: zCents, // integer cents; signed (an account could report negative)
});
export type ContainerSnapshot = z.infer<typeof ContainerSnapshotSchema>;
