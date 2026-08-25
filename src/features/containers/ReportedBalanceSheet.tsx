"use client";

import { useAtomValue, useSetAtom } from "jotai";
import {
  containersAtom,
  dispatchAtom,
  reportedBalanceContainerIdAtom,
  snapshotsAtom,
} from "@/features/store";
import { LogBalanceSheet } from "@/features/containers/LogBalanceSheet";

/** Resolves global sheet state against the live cache. A stale id simply keeps
 * the sheet closed; it never becomes a second source of container truth. */
export function ReportedBalanceSheet() {
  const selectedId = useAtomValue(reportedBalanceContainerIdAtom);
  const containers = useAtomValue(containersAtom);
  const snapshots = useAtomValue(snapshotsAtom);
  const dispatch = useSetAtom(dispatchAtom);
  const setSelected = useSetAtom(reportedBalanceContainerIdAtom);
  const container = containers.find((candidate) => candidate.id === selectedId) ?? null;

  return (
    <LogBalanceSheet
      container={container}
      snapshots={snapshots}
      onDispatch={dispatch}
      onOpenChange={(open) => {
        if (!open) setSelected(null);
      }}
    />
  );
}
