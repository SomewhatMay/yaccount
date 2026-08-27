"use client";

import { useEffect, useMemo, useState } from "react";
import { useAtomValue } from "jotai";
import type { EntryRead } from "@/core/repo/ledger-read";
import { ledgerRevisionAtom, readLedgerEntriesById } from "@/features/store";

/** Exact point selector that clears stale rows while the current revision loads. */
export function useLedgerEntriesById(ids: readonly string[]): EntryRead[] | null {
  const revision = useAtomValue(ledgerRevisionAtom);
  const key = useMemo(() => [...new Set(ids)].sort().join("\u0000"), [ids]);
  const requestKey = `${revision}:${key}`;
  const [result, setResult] = useState<{ key: string; rows: EntryRead[] } | null>(null);
  useEffect(() => {
    let active = true;
    const requested = key === "" ? [] : key.split("\u0000");
    void readLedgerEntriesById(requested).then((next) => {
      if (active) setResult({ key: requestKey, rows: next });
    });
    return () => {
      active = false;
    };
  }, [key, requestKey]);
  return result?.key === requestKey ? result.rows : null;
}
