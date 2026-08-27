# ADR: true Ledger paging and transaction read models

Date: 2026-08-27  
Status: accepted for the paging implementation PR  
Scope: read architecture only; no behavior or schema change in this ADR

## Decision

Keep the op set canonical and the existing materialized entity stores authoritative for current
local state. Add an **additive, reconstructable IndexedDB read model** beside them:

- an entry projection with deterministic keys for all four Ledger sorts and enough fields for
  exhaustive filtering, progressive global Search, pending rows, templates, and direct focus;
- compact exact facts for current per-container balances, daily/monthly balance deltas, entity
  usage, vendor/source recall, shortcut usage, and row counts;
- revision-tagged keyset query APIs. No offsets, full `transactionsAtom`, server, or synced read
  model.

Local transaction mutations update canonical state and affected read records in the same
IndexedDB transaction. Remote merge, reset, import, and rollback already replay the full canonical
op set; they rebuild the read model in that same transaction before commit. A schema migration
creates only additive stores/indexes, then an atomic guarded pass builds the first read model from
the existing `transactions` store. Projection data never enters Drive or exports.

The visible first rollout is Ledger. Other consumers move off the full transaction atom in the
same implementation because their correctness is a prerequisite, but Inbox, Cravings, and other
long lists do not gain paged UI yet.

## Why this gate exists

Today `refreshAtom` calls `getAll(transactions)` at boot and after every write. Seventeen
production consumers receive that array. Ledger sorting and filtering are pure array operations;
void liveness is a whole-graph walk; balances and reports derive from the same array; global Search
builds a full in-memory document index. Rendering fewer rows would not change any of those reads.

The transaction store also mixes four meanings:

- approved ordinary and transfer rows;
- reversal rows used by delete/undo/redo chains;
- pending Inbox rows;
- templates used as shortcuts.

The existing IndexedDB indexes answer container/category/month reports, not deterministic Ledger
order. `entered_at` can be null on rows whose creating op was collapsed from the local journal.
Largest/smallest use absolute amount and break ties by newest-first register order. A naive date
index or `slice()` cannot preserve those rules.

## Canonical and read-model invariants

These are implementation gates, not aspirations.

1. **Canonical history is unchanged.** The Drive snapshot/device ledgers and local `oplog` remain
   the only synced history. Paging never edits, filters, compacts, or reorders ops.
2. **Canonical materialization remains atomic.** Journal append, reducer apply, and local outbox
   enqueue stay in one transaction. Read-model work joins that transaction; it never becomes a
   second commit point.
3. **Domain equality remains provable.** Materialized domain stores equal canonical replay.
   Separately, the read model equals a deterministic derivation of those domain stores.
4. **Read records are disposable.** No op, transaction, setting, reset generation, or recovery
   fact exists only in a read store. Clearing a read store cannot lose financial data.
5. **Incomplete is not empty.** Every scan/page result carries `complete`; any cursor/read error is
   `unknown` with an error, never an empty result or evidence for deletion.
6. **One committed revision is internally exact.** Rows, liveness, balance facts, usage facts, and
   the revision marker commit together. UI results for an older revision are not shown as current.
7. **Ordering is total and device-independent.** Every index key contains all tie-breakers. No
   locale comparison, insertion order, cursor offset, or device clock at read time decides order.
8. **Balances do not use presentation liveness.** Approved non-template reversals remain real
   signed balance deltas. Active-entry reports exclude voided originals and reversal rows through
   the projected liveness result.
9. **Sync convergence implies read convergence.** Equal canonical op sets produce byte-equivalent
   normalized read records and identical page order on every device.
10. **No stale exact figure.** A report/balance renders only after a complete result for the
    current revision. During recomputation it renders its existing loading state, not an old total.
11. **No hidden legacy mode.** The shipped implementation has one read path. Recovery may rebuild
    disposable projections, but there is no user switch or paged-vs-full dual runner.

## Architectures compared

Fourteen materially different designs were evaluated against boot reads/memory, all four sorts,
exhaustive filters/Search, exact derivations, liveness, sync/replay/reset, migration, stale tabs,
and recovery.

| # | Architecture | Boot / query shape | Why it loses or wins |
| --- | --- | --- | --- |
| 1 | Virtualized UI over full atom | Full `getAll`; full array retained | Improves DOM only. Fails the definition of true paging. |
| 2 | Offset pages over raw store | Skip N, take page | Offset work grows with depth; inserts/deletes duplicate or omit rows; no absolute-amount order or exact focus page. |
| 3 | Raw transaction indexes only | Keyset cursor on existing rows | Date fields can help chronology, but active liveness, null `entered_at`, absolute amount, pending/templates, and exact tie order are not indexable as stored. |
| 4 | Key-only sort projection + point joins | Small index, N random transaction reads | Storage-light, but exhaustive text/filter scans become an IndexedDB N+1 join and page latency depends on candidate rejection rate. |
| 5 | Full lightweight metadata atom + paged bodies | All metadata read/retained; row bodies paged | Better than full rows, but memory and boot still scale with transaction count; Search strings and reversal graph dominate metadata size. |
| 6 | Additive entry projection + exact compact facts + on-demand range queries | Keyset pages; bounded progressive scans; compact summaries | **Selected.** Preserves IndexedDB/idb, atomicity, offline use, pure engines, and deterministic recovery while removing the full transaction atom. |
| 7 | Fully materialized CQRS/report cube | Nearly constant report latency | Every report/window becomes migration-coupled schema. Arbitrary ranges, top payees, largest rows, month close, and future widgets create cube explosion and fragile invalidation. |
| 8 | Persistent inverted full-text index | Fast token queries | Current semantics include substrings, structured amount/date facets, live category/container names, and incremental best ranking. Token postings add rename/reversal invalidation and storage without helping Ledger paging or reports. |
| 9 | Month-sharded transaction stores/files | Fast recent chronological pages | Largest/smallest and all-time Search must merge every shard; backdated edits/reversals cross shards; IndexedDB schema cannot create stores per month outside upgrades. |
| 10 | Query/fold the op log directly | One canonical structure | Updates require reduction before rows exist; collapsed local history is not a complete event stream; every query risks replaying history and reimplementing LWW. |
| 11 | Worker-owned full transaction mirror | Main thread stays responsive | Boot still reads and worker memory still holds everything; structured-clone traffic and worker lifecycle add failure modes without reducing storage work. |
| 12 | SQLite WASM on OPFS | SQL indexes, FTS, aggregates | Replaces the proven repository, needs a worker/VFS and a full migration, complicates multi-tab locks/static hosting, and creates two database technologies during the riskiest data change. |
| 13 | Separate IndexedDB read database | Independent disposable cache | IndexedDB cannot atomically commit across databases. A crash can publish canonical revision N with read revision N−1, forcing a reconciliation protocol the same-database design avoids. |
| 14 | Remote/server or Drive query service | Thin client, server indexes | No backend exists; Drive files are not a query database; offline/local-first behavior and privacy would regress. |

### Rejection notes

- Designs 1, 5, and 11 only relocate or shrink the same full-load assumption.
- Designs 2 and 3 cannot meet deterministic mutation-safe paging for all four current sorts.
- Design 4 is a useful projection variant, but rejected-candidate joins make exhaustive filters and
  Search pathologically expensive. The selected projection therefore carries the display/search
  subset, not only ids.
- Designs 7 and 8 may become targeted optimizations after measurements. They are poor correctness
  foundations because they multiply invalidation rules before the first page works.
- Designs 9 and 10 fight current LWW replay and Drive collapse instead of composing with them.
- Design 12 is credible for a new product, not for an additive migration of this one. Official
  SQLite WASM guidance still exposes worker, VFS, concurrency, and browser-specific OPFS choices.
- Design 13 loses the most valuable property available here: one IndexedDB transaction can cover
  canonical materialization and every read projection.
- Design 14 violates the product's no-backend, offline-first boundary.

## Selected design

### Store boundary

Add three reconstructable read stores and one marker family. Names are conceptual until behavior
tests pin the exact schema.

| Store | Contents | Purpose |
| --- | --- | --- |
| `entry_read` | One compact display/search record for each findable live Ledger row, live pending row, and template | Four sorts, filters, Search, Inbox/templates, deep focus |
| `ledger_balance_bucket` | Per calendar day/month, signed delta per affected container | Exact carried balances and historical curves without row loads |
| `ledger_read_fact` | Current per-container balances, counts, category/container/vendor/shortcut usage and recall | Exact boot facts and ranked creation controls |
| `app_meta` keys | Read-model version and monotonically increasing revision | Build guard, cursor/cache invalidation |

`entry_read` duplicates only fields required to render, filter, search, and route a row. It omits
canonical-only payload and never becomes an edit source. An edit fetches the authoritative row by
id from `transactions`.

The existing `transactions` store gains additive raw indexes needed for connected-component
liveness and narrow exact queries: date, reversal target, category/date, source-container/date,
destination-container/date, recurring-rule/date, recurring-occurrence-date, and craving-link/date.
Null keys remain omitted by IndexedDB and are handled explicitly by the query planner. Booleans are
not valid IndexedDB keys, so no index relies on `is_template`; canonical selectors scan a bounded
date/subject range and apply the approval/template predicate in code.

### Entry projection

Each projection record contains:

- `id`, state (`ledger`, `pending`, or `template`), and the display fields used today;
- normalized vendor/source and notes text; category/source/destination/rule/craving ids;
- signed amount, absolute amount, date, and normalized `entered_at`;
- deterministic chronology, magnitude-descending, and magnitude-ascending index keys;
- vendor-kind and shortcut-shape keys needed to repair usage/recall after removal.

`entry_read` has explicit indexes for chronology, largest, and smallest; plus chronology indexes
for category, source container, destination container, recurring rule/occurrence, craving link,
vendor-kind, and shortcut shape. Each is a deterministic nested-array key ending in id. Source and
destination use separate indexes so a transfer is not hidden by a multi-entry/compound-key
limitation. Ledger filters always traverse the requested sort index and apply other predicates in
code; subject indexes serve complete report/maintenance selectors where display order is not the
contract.

Category/container names remain in their small authoritative atoms and are joined while scoring or
rendering. A rename therefore does not rewrite ledger history. Text matching still includes those
names through the existing pure matcher.

Projection eligibility is exactly today's functions:

- `ledger`: approved, non-template, non-reversal, live in the approved reversal graph;
- `pending`: pending, non-template, non-reversal, live in the pending reversal graph;
- `template`: every stored template;
- voided originals and reversal bookkeeping rows: no entry projection.

### Liveness maintenance

Add `by_reverses_id` to the canonical transaction store. For a local transaction mutation:

1. Capture the old row and its old parent before reducer apply.
2. Apply the op through the existing reducer.
3. Starting from old id/parent and new id/parent, walk parents by primary key and children through
   `by_reverses_id` to collect the affected weakly connected component.
4. Run the existing deterministic cycle/live algorithm over that complete component for approved
   and pending predicates.
5. Diff old and new projection eligibility; update `entry_read` and affected usage facts.

App-created chains point backward and components are normally tiny. Branches and malformed cycles
remain supported. The component fixture includes a deliberately large branch so the worst case is
measured, not assumed.

Remote merge/reset/import/rollback do not attempt incremental repair. They already clear and replay
all materialized state. After replay, derive the complete read model once inside the same
transaction, then advance the revision. This avoids subtle arrival-order dependencies.

### Exact sort keys

Newest/oldest share one natural chronology tuple:

`[state, date, entered_at_or_empty, id]`

- newest uses a reverse cursor;
- oldest uses a forward cursor;
- the empty instant sorts oldest within its day, matching current behavior;
- id is the final cross-device tie-break.

Largest uses `[state, abs_amount, date, entered_at_or_empty, id]` with a reverse cursor. This
produces amount descending and newest-first ties.

Smallest must keep amount ascending **and** newest-first ties. It uses a precomputed deterministic
tuple `[state, abs_amount, reverse_day, reverse_instant, reverse_id]` with a forward cursor.
Each reverse string is an IndexedDB array key of negated UTF-16 code units terminated by `65536`;
the terminator correctly reverses prefix ordering as well as differing code units. The empty
instant therefore stays oldest. These pure transforms are parity-tested with prefix and Unicode
ids; locale APIs and hashes are forbidden. This preserves the existing stable-sort semantics even
for thousands of equal amounts.

Every cursor token includes projection version, read revision, sort, normalized filter hash, last
index key, and primary id. Tokens are session-only implementation values, never preferences or
synced data.

### Page and mutation semantics

One page request runs in one readonly transaction and returns:

```ts
type PageResult<T> = {
  rows: T[];
  cursor: string | null;
  revision: number;
  complete: boolean;
};
```

Phone requests 25 matches; larger screens request 50. The scanner may inspect more candidates to
fill a filtered page. Page size never limits completeness.

Between pages, a revision mismatch invalidates the token. Recovery reopens from the prior sort key
with an exclusive bound, deduplicates already loaded ids, and revalidates the visible anchor. It
never converts the mismatch to end-of-list.

- A local create clears Ledger filters, selects newest, resets to page one/top, and flashes the id.
- Sort/filter changes and filter clear reset to page one/top.
- Remote inserts ahead of a scrolled newest view leave loaded rows/anchor in place and expose `New
  entries`; tapping it resets to newest/top.
- Remote edits/deletes within loaded rows revalidate the visible window at the new revision while
  preserving the anchor's viewport offset where possible.
- Navigation away retains pages, query state, and scroll in a session Jotai controller. Return
  restores them only after revision validation. Reload starts a new session.
- Near-end observation requests the next page. Missing observer support or a recoverable failure
  shows `Load more`.

### Exhaustive Ledger filters

The query planner always preserves requested sort order by scanning that sort's index. It narrows
the key range for compatible date/amount bounds, then applies all remaining text/facet/range
predicates through the existing pure matcher. It yields after bounded chunks.

The UI may show matches as soon as one page is available, but keeps a generic loading indicator
while `complete=false`. Empty/complete language appears only after cursor exhaustion. A failed
chunk retains already proven rows, marks the result incomplete, and offers retry/`Load more`.

This is intentionally not an inverted text index in phase one. Current substring semantics and
small bounded result pages make progressive projection scans simpler and safer. Benchmarks decide
whether a later targeted index is justified.

### Progressive global Search

Non-transaction destinations/actions/entities remain a small synchronous index. Once a nonblank
query needs transaction entries:

1. Parse once with the existing `parseQuery`.
2. Abort any prior scan.
3. Cursor-scan `entry_read` in bounded chunks and transform each record to the existing
   `SearchDoc`, joining current category/container names.
4. Score with existing `scoreDoc`; retain only bounded per-kind best results.
5. Publish improving results after each chunk, always tagged with revision.
6. Keep the generic loading state until exhaustion. Only then is ranking final.

Typing a narrower query can immediately rescore already published candidates, but cannot call the
new answer complete until every record has been covered. An aborted/failed scan is unknown, never
zero matches. Query text is never persisted or logged.

A selected transaction result resolves its projection by id, derives the target sort key, fetches
a centered page directly, then scrolls/flashes. It never loads preceding pages. A missing
projection after a complete current-revision lookup means the row is no longer a live Ledger row;
an incomplete lookup means unknown and retries.

### Exact balances, reports, and rankings

`ledger_read_fact` stores current signed balance and net transfer contribution per container.
`ledger_balance_bucket` stores, per container/day and container/month, the signed balance delta and
transfer inflow/outflow/net contribution for **every** approved non-template canonical row,
including voided originals and reversal rows. These reversal-inclusive facts implement the §0.4
financial identity; they never derive from visible-entry liveness. Exact overall balance sums only
currently included, non-archived container facts. Exact carried balance for requested days scans
compact month buckets plus the target month's day buckets, not visible rows. Investment curves,
container flows, and goal contributions use the transfer fields. Filters still hide carried
balances because filtered rows do not explain them.

Active-entry reports query complete `entry_read` ranges/subjects and feed the current pure engines.
The repository exposes complete async selectors for:

- date range;
- category, source container, destination container, recurring rule, and craving link;
- recent/largest bounded detail;
- pending and template collections.

The cash-horizon starting balance uses reversal-inclusive balance buckets. Its approved-future
event list deliberately preserves today's broader `isLiveLedgerRow` behavior by range-scanning the
canonical `transactions.by_date` index and retaining approved non-template rows, including voided
originals and reversals. Active linked-occurrence checks use `entry_read`; pending checks use the
pending projection. This is the only transaction-level reversal-inclusive consumer identified in
the migration audit. Any later engine requiring that identity must use buckets/facts or an explicit
bounded canonical selector, never infer financial truth from `entry_read`.

Selectors use the narrowest index, deduplicate transfer legs, and carry revision/completeness. An
all-time user-selected report may read a large complete subset while that report is open; it does
not repopulate a global transaction atom. Later streaming reducers are allowed only as parity-
tested optimizations.

Usage facts are incrementally derived from projected active entries:

- category count/latest;
- both transfer endpoints' container count/latest;
- normalized vendor/source count/latest by transaction kind plus latest category/container recall;
- shortcut-shape count/latest.

Removing or voiding the latest contributor re-queries that affected key's projection index; it
never leaves a stale latest value. Amount and entry kind are absent from recall output, preserving
current creation rules.

### Consumer migration map

| Current full-atom consumer | Replacement |
| --- | --- |
| Ledger | Page/filter/focus service + balance/day facts |
| Dashboard/reports | Revision-complete range/subject selectors + balance facts |
| Global Search | Progressive `entry_read` scan + small entity index |
| Quick Add/new recurring | Usage/recall facts; template selector |
| Edit transaction | Authoritative row get by id; usage facts for controls |
| Inbox/nav badge | Complete pending selector/count; UI remains unpaged initially |
| FAB shortcuts | Complete template selector + shortcut usage facts |
| Goals/Plan/Containers | Complete subject/date selectors + per-container balances |
| Cravings | Complete craving-link selector; Cravings list itself unchanged |
| Recurring generation/goal maintenance | Exact goal/container selectors before calculation |
| Diagnostics/export | IndexedDB counts; export still canonical `listOps()` |

`transactionsAtom` is removed after the last consumer migrates. No component may reconstruct a
full replacement atom.

## Dispatch, sync, and data-tool behavior

### Local dispatch

The read stores and revision marker join `ALL_STORES`. One readwrite transaction performs:

1. op-id idempotency check;
2. oplog append and outbox enqueue;
3. canonical reducer apply;
4. affected read projection/fact update;
5. revision increment;
6. commit.

If read derivation, structured cloning, an index constraint, or quota fails, the entire transaction
aborts. The op is neither journaled nor shown as saved. This is preferable to accepting a write
while serving an inexact financial view. Projection records stay compact and quota is benchmarked.

### Remote merge and replay

Remote candidates are still validated, unioned, and replayed under `(ts,id)`. Read stores are
cleared/rebuilt from the post-replay materialized stores before the same transaction commits.
Remote ops never enter the local outbox. Quiet sync performs no rebuild.

The sync result returns the new revision. A scrolled Ledger revalidates its visible ids and queries
the newest index above its anchor to decide whether `New entries` is needed. No projection is
uploaded.

### Reset, import, rollback, and clear

Drive backup/retirement and `origin.json` commit ordering remain unchanged. Local `resetTo` clears
canonical materialized/read stores, journals/replays the supplied ops, derives the read model,
stamps reset metadata and revision, then commits once. A bad op or projection failure aborts the
whole local reset. The prior Drive world already has a recoverable backup as today.

Export remains op-based. Import validates the complete envelope before any write. Read facts are
never exported/imported because replay regenerates them.

## Schema migration and older clients

1. Bump IndexedDB once. In the exclusive versionchange transaction, add guarded read stores and
   indexes only. Never clear or rewrite populated canonical stores there.
2. Add `blocking` handling so this and later builds close when a future upgrade requests it. A
   preexisting v4 tab lacks that handler and cannot be forced closed; `blocked` must explicitly ask
   the user to close/reload the other tab. Abnormal termination is also diagnosable.
3. After open, compare the read-model marker with the code's projection version.
4. If absent/old, run one readwrite rebuild from existing materialized stores. Clear/write read
   stores and stamp version/revision in the same transaction.
5. Render financial screens only after that transaction commits. A failure leaves canonical rows
   untouched and the old marker absent; retry is safe.

A client on another device remains wire-compatible because no op type/payload/Drive file changes.
A stale tab on the same origin cannot safely keep an older database connection through the schema
upgrade. The upgrade waits until that tab closes/reloads; it never deletes around the blocker. Once
the database version advances, deploying the pre-paging bundle is not a valid rollback because
IndexedDB rejects version downgrade opens.

Release rollback is therefore **forward-only**: retain the new DB version/stores and ship a fix or,
only as an emergency source-control patch, restore the old UI/read code while keeping the new open
version and migration handlers. No dual path or user toggle is shipped in advance.

## Multi-tab and cache consistency

IndexedDB serializes overlapping readwrite transactions and gives readonly transactions a stable
snapshot. That is the correctness mechanism. `BroadcastChannel` is only an advisory post-commit
revision notification so other tabs can refresh promptly; focus/visibility and every query also
read the durable revision. Missing a broadcast can delay freshness, never make a stale write win.

Web Locks are not required for ordinary writes or page reads. Adding a second cooperative lock
would duplicate IndexedDB scheduling and introduce deadlock/abandoned-lock behavior. The exclusive
versionchange transaction remains the migration lock.

## Architecture-gate coverage

| Required concern | Selected answer |
| --- | --- |
| Boot reads / steady memory | Load small entity atoms, exact facts, and the first Ledger page only. Remove the N-sized transaction atom. |
| Newest / oldest / largest / smallest | Four deterministic keyset traversals with explicit ties; no offset. |
| Full text/facet/range filters | Bounded progressive scan in requested sort order; `complete` gates final/empty states. |
| Global Search | Bounded top-k progressive projection scan; final parity with current scorer. |
| Dashboard/report aggregates | Revision-complete range/subject selectors plus exact balance buckets/facts; skeleton until complete. |
| Vendor/category/container usage and recall | Atomic compact usage facts; affected-key repair when the latest row disappears. |
| Void/reversal liveness and undo/redo | Indexed weak-component recomputation using the existing cycle/live rule. |
| Pending rows and templates | Explicit projection states and complete selectors; visible UIs stay unpaged initially. |
| Local dispatch refresh | Atomic projection/fact/revision update; refresh only small entity atoms, then invalidate async selectors. |
| Remote sync/replay | Canonical union/replay unchanged; full read-model rebuild in the same commit when new ops exist. |
| Reset/import/rollback | Existing Drive commit/backup rules unchanged; local canonical/read install remains one transaction. |
| Multi-device convergence | Read model is local deterministic derivation; no read data syncs or changes wire payloads. |
| IndexedDB migration / old clients | Additive versioned stores/indexes, guarded rebuild, safe blocked state, other devices wire-compatible. |
| Deep links/focus | Projection lookup plus centered cursor window; never load preceding pages. |
| Interrupted upgrade/build, crash, quota | Atomic rollback or absent marker; canonical data untouched; retry without treating missing projection as missing data. |
| Partial reads | Typed incomplete/unknown state; never definitive empty/end or deletion evidence. |
| Stale tabs/cursors/results | Durable monotonic revision, stable readonly snapshots, key recovery, advisory broadcast, stale-result discard. |
| Testability | Pure keys/projectors/reducers, fake-indexeddb atomicity, browser performance fixtures, model-based parity. |
| Complexity / maintainability | One existing database/library, three read stores, current pure engines retained, no server/worker/SQL/full-text subsystem initially. |
| Rollout / recovery | Ledger-only visible rollout, additive data, rebuildable projection, forward-only rollback, later-list issue. |

## Failure-mode analysis

| Failure | Required result |
| --- | --- |
| Crash during schema upgrade | Version/store/index changes roll back atomically; retry open. |
| Crash during first projection build | Canonical state unchanged; marker not advanced; retry full rebuild. |
| Quota during projection build | Transaction abort; preserve all canonical rows/ops; diagnose and offer retry/export. |
| Quota during local dispatch | Whole dispatch aborts, including oplog/outbox; form retains input; no success feedback. |
| Projection code throws | Same atomic abort; invariant diagnostic contains counts/type, never financial content. |
| Cursor/page read fails | Preserve proven rows; `complete=false`; retry/Load more. Never show definitive empty/end. |
| Revision changes between pages | Invalidate token; exclusive-key recovery and anchor revalidation; never use offset. |
| Remote insert ahead of viewport | Preserve anchor; show `New entries`; top reset only on user action. |
| Remote edit moves loaded row | Revalidate visible window at new revision; remove old position and insert new only if in window. |
| Remote delete/void | Recompute complete reversal component; stale row disappears after revision revalidation. |
| Unknown newer-client op | Existing validation drops it before journal/read rebuild; it cannot poison projection. |
| Malformed reversal cycle | Existing deterministic cycle rule hides cycle; projection parity test pins result. |
| Partial filter/Search scan | Results remain provisional and loading; failure is unknown, not no-match. |
| Stale report promise resolves | Revision mismatch discards it and reruns; stale total never renders as current. |
| Old same-origin tab blocks upgrade | `blocked` state requests closing/reloading it; wait safely. New builds close on future `blocking` events. |
| Broadcast is lost | Durable revision check on query/focus catches up. |
| Reset/import fails after Drive commit | Existing adoption flow self-heals; local atomic reset never half-installs read data. |
| Read model is corrupt but canonical state opens | Version/invariant validation rejects it; guarded full rebuild replaces only read stores. |
| Canonical read fails during rebuild | Abort. Never treat unread rows as absent or publish a marker. |

## Verification fixtures

### Correctness corpus

Build deterministic generators plus named adversarial fixtures:

- 0, 1, 24, 25, 26, 49, 50, and 51 active rows for page edges;
- 1k, 10k, 50k, and 100k total rows;
- many rows on one day and thousands with equal absolute amount;
- null and real `entered_at`, equal instants, prefix/Unicode ids with opposite lexical order;
- expenses, income, both transfer legs, zero, refunds, safe-integer boundary values;
- active delete, undo, redo, branches, pending/template reversers, orphan targets, and cycles;
- pending rows, templates, approvals, template removal, transaction update, and backdating;
- archived/stat-excluded categories; archived/included/excluded/investment containers;
- category/container rename after entry creation;
- Unicode NFC/case/space vendor variants and notes-only Search hits;
- date/amount/text/facet combinations with no early match and a last-record match;
- focus ids in first/middle/last pages and a row moved by remote edit;
- local/remote ops inserted before/at/after an active cursor, including equal `(ts,id)` boundaries;
- reset/import/rollback generations and an interrupted/failed projection rebuild.

### Required parity properties

For every generated canonical state:

1. Concatenating every page for each sort equals current `sortRegister(activeRows(all))` exactly.
2. Every filter's progressive final output equals current `applyFilter` then sort.
3. Progressive Search's final bounded output equals current full `buildSearchIndex`/`search`.
4. Projection ledger/pending/template ids equal `activeRows`/`pendingRows`/`templateRows`.
5. Per-container/current/carried balances equal current balance engines for every requested day.
6. Every report, usage rank, recall, maintenance result, and deep focus equals the full-array
   implementation at the same revision.
7. `stripReadStores(database) == replay(listOps())` for domain state, and
   `readStores == derive(domainState)` after dispatch, remote merge, reset, and reopen.
8. Any injected failure before commit leaves op log, materialized domain, outbox, read stores, and
   revision at the prior snapshot.

### Mutation sequences

Use model-based randomized sequences, always under canonical total order:

- fetch page → local insert/update/void/undo → next page;
- fetch page → remote older/newer op merge → recover cursor;
- active filter scan → mutation → restart/reconcile;
- Search scan → query change/abort → final parity;
- reset/import/rollback during cached session state;
- two repos converging from shuffled arrival order, then comparing every index/page/fact.

## Performance benchmarks and gates

Run production Chromium against real IndexedDB, plus fake-indexeddb correctness tests. Record the
machine/browser and median/p95 over at least 20 warm samples after three warmups. Phone page size is
25; desktop is 50. Use the 50k corpus as the merge gate and 100k as a reported stress result.

| Measure | 50k merge gate |
| --- | --- |
| Normal cold boot transaction-row materialization | Zero full `transactions.getAll`; no N-sized JS atom |
| Initial newest page | p95 ≤ 100 ms desktop; ≤ 200 ms mobile-emulated |
| Next unfiltered page | p95 ≤ 100 ms desktop; ≤ 200 ms mobile-emulated |
| Largest/smallest first and deep pages | Same limits; latency must not grow with page ordinal |
| Filter first provisional page | ≤ 150 ms when an early match exists |
| Exhaustive worst-case filter | Completes ≤ 2.5 s while yielding at least every 25 ms |
| Global Search first provisional transaction hit | ≤ 150 ms when an early hit exists |
| Global Search exhaustive final rank | Completes ≤ 2.5 s while input remains responsive |
| Local transaction dispatch/read-model update | p95 ≤ 150 ms, including a 100-node reversal component |
| Ledger steady retained transaction records | Loaded pages + bounded scan/results only; no count-proportional atom |
| First additive projection build | Completes ≤ 10 s at 50k; interruption remains retry-safe |

Budgets are regression gates, not permission to weaken correctness. A miss requires profiling and a
reviewed optimization or a documented stop; raising a timeout is not a fix. Also record IndexedDB
storage growth and reject the read stores/indexes if they exceed 2× the serialized canonical
transaction store at 50k without a reviewed reason.

## Implementation phases

1. **Pure contracts:** sort-key, cursor, liveness-component, projection/fact reducers, parity
   fixtures, failure injection, and benchmarks. Confirm failures before production code.
2. **Additive repository:** schema/index guards, stale-connection handling, atomic initial rebuild,
   revisioned page/filter/focus APIs, balance/usage facts, dispatch and replay integration.
3. **Consumer split:** replace full-atom consumers with revision-complete selectors; remove
   `transactionsAtom`; retain existing UI behavior.
4. **Ledger rollout:** session page controller, near-end loading/fallback, mutation semantics,
   carried balances, direct focus, accessibility, and phone/desktop sizes.
5. **Progressive Search:** bounded exhaustive scan, abort/revision handling, final parity.
6. **Integrity pass:** sync/reset/import/rollback/replay convergence, migration failure recovery,
   stale tabs, 50k/100k benchmarks, full verification.
7. **Follow-up boundary:** create/link one issue for paged Inbox, Cravings, and other measured long
   lists. Do not expand visible paging in the first PR.

No phase may ship while a parity, atomicity, incomplete-read, migration, or exact-figure invariant
is unproved. If the additive projection cannot meet those gates, stop before Ledger UI integration.

## Consequences

Benefits:

- boot and steady UI memory stop scaling with Ledger row count;
- all four sorts have deterministic mutation-safe keyset paging;
- Search/filter completeness stays honest and progressive;
- canonical sync/data-tool safety is unchanged;
- read corruption is recoverable by rebuilding disposable stores.

Costs:

- transaction writes gain projection/fact work and can fail if that atomic work fails;
- schema adds duplicate compact entry data and several indexes;
- consumers become async/revision-aware;
- remote replay still performs a full rebuild when genuinely new ops arrive;
- all-time reports may load a large scoped subset while open until streaming reducers prove useful.

## Sources

- [W3C Indexed Database API 3.0](https://www.w3.org/TR/IndexedDB/) — transactional atomicity,
  upgrade exclusivity/rollback, compound key ordering, indexes, and directional key cursors.
- [`idb` API](https://github.com/jakearchibald/idb) — current wrapper support for upgrade,
  `blocked`, `blocking`, `terminated`, transactions, indexes, and cursors.
- [W3C Web Locks API](https://www.w3.org/TR/web-locks/) — evaluated for cross-tab coordination;
  not selected because IndexedDB already serializes overlapping writes.
- [WHATWG BroadcastChannel](https://html.spec.whatwg.org/multipage/web-messaging.html#broadcasting-to-other-browsing-contexts)
  — advisory cross-context invalidation only.
- [SQLite WASM persistent storage](https://www.sqlite.org/wasm/doc/trunk/persistence.md) — evaluated
  OPFS worker/VFS, portability, and concurrency trade-offs.

## Unresolved questions

- None architectural. Page/scan chunk sizes beyond approved 25/50 are benchmark-tuned in PR 5.
