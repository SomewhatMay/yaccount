# Ledger paging performance stop

Date: 2026-08-27

Environment:

- WSL2, AMD Ryzen 5 5600, 6 cores / 12 threads
- Playwright 1.61.1 Chromium 149.0.7827.55
- production static export, real IndexedDB

Corpus: 50,000 canonical transaction rows, 101-row reversal component, repeated
vendors/amounts, early and exhaustive text hits. Fixture creation is excluded from measured
projection time.

Result: **stop**. The guarded first projection build did not commit within 120 seconds. Gate:
10 seconds. The 100k stress run and downstream query percentiles were not run because the 50k
merge gate failed first.

Observed attempts:

1. v4→v5 schema upgrade plus sequential projection: v5 index backfill took about 18 seconds;
   projection remained incomplete after another 102 seconds.
2. v5 schema prebuilt plus batched projection writes: incomplete after 120 seconds.
3. Native IndexedDB request queue, representative repeated shortcut shapes: incomplete after
   120 seconds.
4. Native compound key paths and compact reverse-tie strings instead of duplicated key arrays:
   incomplete after 120 seconds.

The same browser took about 50 seconds to seed 50k canonical rows with five populated secondary
indexes. The selected ADR shape populates seven projection indexes for ordinary rows, so its
write amplification cannot meet the approved build gate on this machine.

`LEDGER_PERF_ROWS=50000 npm run test:perf` reproduces the stop after `npm run build`. Normal e2e
skips the opt-in benchmark.

Do not merge paging implementation until a reviewed architecture change meets the existing gate.
Do not raise the timeout. Candidate review boundary: chunked sorted projection pages or another
storage shape that preserves atomic recovery, exact keyset ordering, bounded scans, incremental
writes, and the storage ceiling.
