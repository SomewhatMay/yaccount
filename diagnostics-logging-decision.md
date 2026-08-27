# Local diagnostics logging decision

Date: 2026-08-27

## Decision

Persist the existing redacted `LogRecord` shape in a separate
`yaccount-diagnostics` IndexedDB database. Queue records in memory, write one atomic batch
after a short timer, then prune records older than 14 days and oldest records beyond 2,000.
Reads and writes fail open to the existing bounded memory log. No unload-time write and no
automatic transmission.

The stored fields stay minimal: ISO instant (ordering and failure timeline), level (severity),
scope (failing subsystem), message (phase/outcome), and optional technical detail. No financial
payload, interaction event, user content, or default correlation identifier is stored.

## Compared approaches

| Approach | Strengths | Rejected cost |
| --- | --- | --- |
| One JSON ring in `localStorage` | Smallest code; survives reload | Reads/writes are synchronous and block JavaScript; rewriting the full ring amplifies every batch; fixed small quota |
| Store logs in financial IndexedDB | Existing connection and transaction helpers | A ledger open/migration failure also removes the evidence and failure-screen export path |
| Append text in OPFS | Efficient file-style storage; worker-only synchronous handles | Adds file rotation/parsing or an index, worker lifecycle, and more failure modes for only 2,000 small records |
| Separate IndexedDB store | Async; ordered indexes; atomic batch/prune; existing `idb` dependency; independent open failure | A very recent queued batch can be lost in a hard crash |

Separate IndexedDB is the smallest adequate design. IndexedDB operations are asynchronous, while
Web Storage is synchronous and can block responsiveness. OPFS is optimized for file and in-place
workloads, but its strongest synchronous APIs require a worker. `idb` already supplies Promise
transactions and cursor/index helpers used by this app.

## Batching, retention, and failure behavior

- Redact before a record enters either memory queue.
- `enqueue` only appends to a bounded array and schedules one timer; no storage promise enters the
  user-action path.
- One read/write transaction appends the batch and applies both retention limits.
- Bound the pending queue to 2,000 so a logging storm cannot grow memory without limit.
- Explicit copy/download first flushes the current batch, then reads oldest-first.
- Do not start IndexedDB work from `unload`: browsers do not guarantee such transactions complete.
- Catch every open/read/write/prune error. Financial commands never await diagnostics storage.
- Keep one production policy (`info` console, all strategic records retained); no Settings level
  selector or verbose mode.

## Export

Copy and download build the same plain-text artifact. Download uses a text `Blob`, object URL, and
anchor `download`; nothing is sent over the network. The header includes package version, UTC build
time, full commit SHA, and exact commit URL. Builds without injected deployment metadata say
`local`.

## Sources

- [MDN: IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [MDN: Web Storage API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API)
- [MDN: IndexedDB shutdown warning](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB#warning_about_browser_shutdown)
- [MDN: storage quotas and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- [MDN: origin-private file system](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system)
- [`idb` API and transaction guidance](https://github.com/jakearchibald/idb)
- [MDN: anchor downloads](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/a#download)
