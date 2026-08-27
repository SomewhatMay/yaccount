# Next features build plan

Status: approved 2026-08-27. Implementation authorized through the overnight loop prompt.

## Working rules

- Decide one question at a time.
- Update this file after every decision.
- TDD every behavior change: failing test, confirm failure, minimum pass, `npm test`.
- Design mobile-first and preserve accessibility.

## Current architecture findings

- Vendor/source suggestions already use native `<datalist>` in Quick Add, transaction edit, and recurring-rule create/edit.
- Existing vendor suggestions are usage-ranked across active non-transfer entries.
- Category/container selects are usage-ranked but not searchable.
- Every boot/write loads the full transaction IndexedDB store into `transactionsAtom`.
- Ledger liveness, balances, filters, usage ranking, widgets, and global search consume that full atom.
- IndexedDB transaction indexes cover container/category/month reports, not chronological paging.
- Logging already has scoped loggers, redaction, a 300-record memory buffer, diagnostics copy, error boundaries, and global uncaught/unhandled capture.
- Logs do not survive reload. Routine operation/phase telemetry is sparse.

## 1. Add-form autocomplete

### Decisions

- Apply only to creation flows:
  - Quick Add.
  - New recurring rule.
- No autocomplete or vendor-driven recall in transaction/rule edit flows.
- Searchable fields:
  - Vendor/source.
  - Category.
  - Container/source container.
  - Transfer destination.
- Vendor/source suggestions are restricted to the form's current kind.
- Transfers do not use vendor history suggestions.
- Empty vendor/source focus shows most-common matches for the current kind.
- Typed matching prioritizes prefix similarity; frequency breaks equally similar matches.
- Vendor match may be selected explicitly or triggered by an exact match on blur.
- A matched vendor/source recalls its latest matching entry's:
  - Category.
  - Container.
- Vendor recall never changes amount.
- Vendor recall never changes entry kind; incompatible kinds are excluded.
- After recall, changing vendor text to an unknown variation preserves recalled category/container.
- Category/container/destination autocomplete selects existing entities only. No inline creation.
- Keep current defaults:
  - Most-used category for current kind.
  - Default spending container.
- Visible suggestions before scroll:
  - Phone: 5.
  - Larger screens: 8.

### Design/implementation notes

- Replace native `<datalist>` with an accessible custom combobox so ranking, selection effects, list height, and iOS behavior are deterministic.
- Category choices remain restricted to current kind.
- Transfer destination excludes source container.
- Recall source is the latest active matching entry after case-folding, trimming, and NFC normalization.
- Suggested testing seams: pure ranking/match/recall engine plus creation-form wiring tests.

## 2. Phone declutter and search focus

### Decisions

- Dashboard will receive a deeper, separate redesign rather than only inheriting the shared page-density changes.
- Other list/detail pages remain one shared phone-density pass.
- On phones, non-dashboard page headers show only the page title and their one header control.
- On desktop, non-dashboard headers retain eyebrow, title, explanatory paragraph, and header control.
- Remove editorial/expressive page titles app-wide.
- Use the direct screen name as a compact 20–24px visual `<h1>` for orientation and accessibility (for example, `Dashboard`, `Categories`, `Goals`).
- Hide eyebrow and explanatory paragraph on phones.
- Desktop may retain explanatory context, but the direct screen name remains the `<h1>` and no large editorial tagline competes with content.
- Keep the existing two-row mobile filter rail: search/sort row plus horizontal facet/range chip row.
- Tighten non-dashboard phone section gaps from 24px to 16px; retain 24px on desktop.
- Try reducing the phone main-content top inset below the sticky bar from 20px to 12px; desktop remains 20px.
- All spacing/density changes (section gaps, page top inset, dashboard widget gaps/padding) belong to the final implementation phase and require manual hand-tuning/approval.
- Global command Search autofocuses its input on phone and opens the keyboard immediately.
- Global Search opens near the top safe area on phones, overlaying the app header rather than leaving the current large gap or starting below the header.
- Global Search keeps its input at the top and expands its internally scrolling result area to the bottom of the currently visible region above the keyboard.

### Mandatory iOS focus prerequisite

- The previous iOS focused-field/keyboard patch was approved after a lucky test but is not reliable. Treat it as unresolved.
- Batch the general iOS sheet focused-field fix with the global Search keyboard/suggestion work.
- Before attempting a solution, the implementation agent must conduct fresh online research into current iOS Safari and installed-PWA keyboard/viewport behavior and known WebKit issues. Continue research as needed; do not assume the current workaround or viewport meta is sufficient.
- Reproduce the failure first on real iOS hardware. Simulator/browser emulation is supplementary only.
- Validation must be repeatable across multiple open/focus/type/scroll/dismiss/reopen cycles, not one successful pass.
- Cover inputs near the bottom of long sheets as well as global Search.
- Test Safari and installed Home Screen PWA, portrait at minimum; include current user iOS/device plus another available iOS/device version when practical.
- Log the tested device, iOS version, browser/PWA mode, keyboard state, and result in the implementation handoff.

### Dashboard decisions

- Dashboard redesign must substantially simplify the current period label, Compare control, Widgets control, and space-heavy horizontal dashboard-set list.
- Retain the horizontal dashboard-set list; rapid one-tap switching is worth its space.
- Move Compare into the period picker.
- Move widget/dashboard management actions into one overflow menu.
- Remove Overall Balance's pinned/mandatory/always-first behavior. It becomes optional, hideable, and movable like every other widget.
- Overall Balance is currently a `bare` borderless figure.
- Overall Balance will gain the same standard rounded card, header, collapse control, and widget menu as other widgets.

### Current dashboard pain

- Too many controls compete above content: period, Compare, Widgets.
- Horizontal dashboard-set selector consumes too much vertical/visual space.
- The horizontal selector remains, but surrounding control/title height must shrink.
- Large expressive titles such as `How the money moved` take too much visual attention and will be removed in favor of direct compact screen names.
- Final control hierarchy and widget treatment are confirmed below.

### Final dashboard hierarchy

- Primary: title and financial content.
- Secondary viewing context: dashboard set and reporting period.
- Advanced period mode: comparison.
- Editing tools: customize, add/hide/reorder widgets, create/manage dashboard sets.

### Confirmed dashboard controls

- Horizontal dashboard-set list stays.
- Compare is part of the period picker, not a peer button.
- When comparison is active, the one period chip summarizes both windows (for example, `3 months vs 1 month`).
- Both primary and comparison windows are configured inside the period sheet; comparison never adds another normal-view header row.
- Widget/dashboard management is in one overflow menu.
- Compact phone header uses two rows:
  - Row 1: `Dashboard` title, period control, overflow menu.
  - Row 2: horizontally scrollable dashboard tabs, including add.
- Avoid a third control row in normal viewing mode.
- Comparison on phones keeps two full stacked widget copies: primary, then comparison.
- A custom one-card comparison design per widget is deferred for possible future work.

### Dashboard layout invariant change

- Remove the pinned-widget invariant from dashboard layout normalization, reorder, visibility, reset, and editor UI.
- Existing synced dashboard definitions must migrate/fail open without losing widget order/settings.
- Default/starter dashboards may still include Overall Balance by curation, but users can move or hide it.

### Provisional density experiment — implement last

- Phone widget gap: try 12px instead of 24px.
- Phone widget padding: try 16px instead of 20px.
- Keep desktop roomier.
- This is explicitly unsure, must be implemented at the very end, and needs manual user evaluation before acceptance. Revert/adjust freely based on the hands-on result.

## 3. Ledger lazy loading

### Verified current state

- The current architecture can lazy-render rows, but cannot avoid loading the full ledger: `refreshAtom` calls `getAll(transactions)` after boot and every write.
- True repository paging needs a transaction ordering index/query API and a split between summary/index state and paged row state.
- Void-chain liveness, global search, aggregate widgets, filtering, and non-date ledger sorts prevent a naive `slice()` architecture from reducing data reads.

### Decisions

- Implement true repository paging: unloaded ledger rows are not all read into app memory at boot.
- Architecture gate accepted in [`ledger-paging-architecture.md`](ledger-paging-architecture.md):
  additive same-database entry read model, exact compact balance/usage facts, revision-tagged keyset
  cursors, and progressive exhaustive scans. Canonical ops/materialized rows remain unchanged.
- UI-only batching over a full `transactionsAtom` is insufficient.
- Ledger search and filters are exhaustive across the full ledger, never limited to already loaded pages.
- Exhaustive does not mean blocking on loading/scanning everything before showing results.
- Search/filter may progressively scan/query pages, render strong early matches immediately, and add matches until all relevant data has been covered.
- Optimize for instant perceived response while preserving eventual completeness.
- Do not show a definitive empty/complete state until the exhaustive query has completed.
- Show a generic loading/progress indicator while results remain incomplete.
- Do not label the work `Searching older entries`; the scan/query order may not be chronological.
- Default page sizes:
  - Phone: 25 initial rows and 25-row increments.
  - Desktop: 50 initial rows and 50-row increments.
- Page size is a performance/UX tuning value, never a query correctness limit.
- Load the next page automatically as the scroll nears the end.
- Provide a visible `Load more` fallback when automatic observation is unavailable or a recoverable page load fails.
- A global Search result or `?focus=` deep link to an unloaded row fetches that row and its surrounding page directly, then scrolls/flashes it.
- Never require loading every preceding page to honor a focus target.
- Preserve loaded Ledger pages and scroll position when navigating away and returning during the same app session.
- This is session state; persistence across full reload remains undecided/not required.
- Clearing a Ledger search/filter resets the unfiltered register to its first page at the top; do not restore the prior unfiltered scroll position.
- Changing Ledger sort resets that sort to its first page at the top.
- Adding a new entry while Ledger is scrolled resets/jumps to the newest-first top and flashes the new row.
- Global Search progressively evaluates the full ledger while showing only its bounded best entry matches.
- The visible best-match set may improve/reorder during the query; the generic loading indicator remains until ranking is final.
- Dashboard/report financial figures must be exact and current before display.
- Do not show stale cached totals while background aggregation catches up.
- Incrementally maintained/materialized summaries are allowed only if their correctness and atomic update/rebuild behavior satisfy the architecture gate.
- Preserve all Ledger sorts: Newest, Oldest, Largest, Smallest.
- The mandatory 10+ architecture comparison must deeply analyze ordered paging for all four sorts. No hasty choice of indexes/cursors.
- Sort design must cover deterministic tie order, inserts/updates/deletes during an active cursor, remote sync changes, filter changes, direct focus-page fetches, cursor invalidation/recovery, and identical ordering across devices.
- Preserve exact carried balances in chronological Ledger day headers across page boundaries and unloaded rows.
- Carried balances must never be approximated from only visible/loaded rows.
- When sync adds entries while Ledger is scrolled, preserve position and show a `New entries` jump control instead of force-scrolling.
- Adding an entry while Ledger search/filters are active clears them, resets to newest-first top, and flashes the new row.
- Initial visible true-paging rollout is Ledger only.
- Architecture must make Inbox, global Search, dashboard/report consumers, autocomplete/ranking, and other transaction consumers correct without a full transaction atom, but do not add paged Inbox/Cravings UI in the initial PR.
- Reuse the proven paging UI/architecture for Inbox, Cravings, and other justified long lists later.
- The implementation PR must clearly state this rollout boundary.
- The implementation agent must create a GitHub follow-up issue via `gh` for extending proven paging to Inbox, Cravings, and other assessed long lists, then link that issue in the PR.
- Do not build a device-local legacy full-load fallback switch or a dual-run paged-vs-legacy parity framework for rollout.
- Rationale: single current user, breakage is acceptable during this stage, and user data is already backed up.
- This does not relax core TDD, migration, replay, sync, and data-invariant correctness tests.

### Mandatory architecture gate — critical data-safety work

- True paging is considered unusually hard and high risk. No hasty architecture decision.
- Before implementation, the designing agent must spend substantial time developing and comparing at least 10 materially distinct architectures. Minor variations do not count as separate approaches.
- The comparison must be written down and cover, at minimum:
  - Boot reads and steady-state memory.
  - Ledger newest/oldest/largest/smallest paging.
  - Full-ledger text/facet/range filtering.
  - Global command/Spotlight-style search.
  - Dashboard/report aggregates.
  - Vendor/category/container usage ranking and recall.
  - Void/reversal-chain liveness and undo/redo.
  - Pending rows and templates currently sharing the transaction store.
  - Local dispatch refresh behavior.
  - Remote sync, replay, reset, import, rollback, and multi-device convergence.
  - IndexedDB schema/index migration and older-client compatibility.
  - Deep links/focus to unloaded rows.
  - Correctness under interrupted upgrades, partial reads, crashes, quota errors, and stale tabs.
  - Testability, complexity, maintainability, and rollout/recovery.
- Select the best approach or an explicitly justified hybrid only after the comparison. Document why every rejected approach loses.
- Before coding, write invariants and a failure-mode analysis proving paging cannot alter the canonical op log, silently omit live data, corrupt materialized state, or turn an incomplete read into deletion/absence.
- The op log remains canonical; pagination is a read architecture and must not weaken atomic dispatch/replay/sync/reset guarantees.
- Prefer additive, guarded migrations. Never drop/rebuild the populated local cache without a verified recoverable path.
- Require a reviewed architecture decision record and phased migration/rollback plan before the first behavior test or implementation change.
- Performance wins never justify uncertain data correctness. If correctness cannot be demonstrated, stop at the design gate.

## 4. Logs and error reporting

### Verified current state

- Existing: scoped `loglevel` logger, redacted bounded buffer, diagnostics facts/copy, route/section/global boundaries, uncaught errors, unhandled rejections, dispatch/sync/data-tool capture.
- Confirmed gaps addressed below: persistence, selective diagnostic events, export, build identity, failure-screen access, retention, notification policy, and performance isolation.

### Decisions

- Local-only logging/error reporting.
- No backend exists; do not add or assume one.
- No external crash/telemetry service and no automatic transmission.
- Diagnostics leave the device only through an explicit user copy/export action.
- Logs persist on-device across reloads and crashes so the pre-failure trail survives.
- Retain at most 2,000 records and 14 days, pruning whichever boundary is reached first.

### Diagnostic logging policy

- Logs exist only to debug failures and incorrect state, not measure engagement or usage patterns.
- Be strategic; do not log every little action.
- Log meaningful production-grade boundaries and facts:
  - App/session boot and version/schema facts.
  - Database open/migration/rebuild outcomes and durations.
  - Meaningful write intent by operation type and outcome; add an identifier only where it materially connects a multi-phase failure. Never payload content.
  - Sync/reset/import/restore phases, counts, outcomes, durations, and unusual state transitions.
  - Paging/search infrastructure failures, cursor invalidations/recoveries, incomplete-state guards, and slow operations.
  - Error-boundary, uncaught error, unhandled rejection, quota/storage, and invariant failures.
- Do not log analytics-style or high-volume interaction noise:
  - Screen-view/navigation history.
  - Keystrokes, search/filter text, focus, scroll, pointer/touch events.
  - React renders or routine state updates.
  - Every successful page fetch/query.
  - Vendor/source, notes, amounts, category/container names, or other financial content.
- Prefer one concise phase record over many low-value breadcrumb records.
- Logging must be buffered/batched off the interaction-critical path and performance-tested so it does not cause perceptible lag.

### Mandatory logging design research

- Do not default to a verbose structured-event platform, pervasive correlation IDs, or enterprise observability architecture.
- Before implementation, the designing agent must conduct deep online research into battle-tested local-only browser/PWA logging for a no-backend, one-developer system.
- Compare several simple approaches for persistence, batching, pruning, crash survival, export, redaction, and failure behavior.
- Choose the simplest proven record shape and persistence design that gets the debugging job done.
- Every stored field and logged event must justify its diagnostic value and performance/privacy cost.
- Correlation/phase identifiers are optional and should exist only where they materially help reconstruct a multi-step failure.
- Logging failure must never break or block financial operations.
- Diagnostics UI provides both `Copy diagnostics` and `Download diagnostics`.
- Both exports are explicit local-only user actions; nothing is transmitted automatically.
- User-facing errors are concise and actionable.
- Keep technical stack/body/detail behind a `Details` disclosure and in diagnostics rather than dumping it into every toast.
- Do not build a universal in-context Retry/preserved-state error framework in this phase.
- Add/retain Retry only for selected failures where it is straightforward and naturally scoped.
- This work gathers useful bug evidence; comprehensive recovery UX is a future concern.
- Use one intentional production logging level/policy.
- Do not expose a log-level selector or separate verbose/debug mode in Settings.
- Diagnostics/export must identify the exact running code with real app version, commit/build identifier, and build date.
- `NODE_ENV=production` is not an acceptable build identifier.
- GitHub Actions injects the app version, full `github.sha`, repository URL, and UTC build time into the static build.
- Diagnostics UI shows the version, build time, and short SHA; the SHA links to the exact GitHub commit.
- Copy/download exports include the full SHA and commit URL.
- Local builds explicitly identify themselves as `local` rather than fabricating a deployed commit.
- This is build-time metadata; it requires no backend or runtime network request.
- Persistent diagnostic storage must fail independently from the main financial IndexedDB.
- If the financial database cannot open, prior logs must remain readable/exportable from the failure UI where practical.
- Error-notification policy:
  - Failed user action: concise immediate message.
  - Meaningful background failure with user impact/action: quiet persistent status/warning.
  - Background failure without user impact/action: log only.
  - Do not show a generic toast for every uncaught background error.
- Existing behavior is partial: sync already has a persistent banner; background recurring/goal maintenance only logs; the global uncaught handler currently toasts and needs policy alignment.
- Database boot-failure UI includes `Copy diagnostics` and `Download diagnostics` using the independent log store, not merely the immediate error string.
- Root/global crash UI also shows the build ID and exposes Copy/Download diagnostics when the independent logger remains available.
- Do not add an `Open GitHub issue` action. Reporting remains Copy/Download only.

## Unresolved questions

- Real iOS Safari/Home Screen PWA validation ([#44](https://github.com/SomewhatMay/yaccount/issues/44)).
- Final density values after hand test?

## Implementation sequence

Each behavior PR follows strict TDD: add the failing test, run it and confirm the intended failure, implement the minimum pass, then run `npm test`. Also run proportionate typecheck, lint, build, and e2e checks before handoff.

### PR 1 — Local diagnostic foundation

1. Research battle-tested local-only browser/PWA logging for a no-backend, one-developer app.
2. Write a short decision note comparing several simple persistence/batching/pruning designs. Select the smallest adequate one.
3. Add failing tests for persistence, both pruning limits, redaction, logging-storage failure isolation, copy/download output, and build metadata/commit links.
4. Implement independent persistent diagnostic storage and low-overhead batching selected by research.
5. Add only the strategic diagnostic boundaries in this plan. Remove/avoid analytics noise.
6. Remove the Settings log-level selector.
7. Add `Download diagnostics` beside Copy.
8. Stamp version, full commit SHA, repository URL, and UTC build time from GitHub Actions. Show linked short SHA; export full metadata; label local builds `local`.
9. Align notifications: action failure immediate; meaningful background issue persistent; non-actionable background issue log-only; no blanket background toast.
10. Add full Copy/Download diagnostics to database boot failure and root/global crash surfaces where independent logging is available.
11. Verify logging overhead with a realistic operation burst and prove no perceptible interaction-path blocking.

### PR 2 — Creation autocomplete + iOS keyboard/Search repair

1. Before code, research current iOS Safari and installed-PWA virtual-keyboard, focus, Visual Viewport, fixed-dialog, and combobox behavior. Review current WebKit issues and browser support.
2. Reproduce the existing failure repeatedly on real iOS hardware. Record device/iOS/browser-vs-PWA details.
3. State which aspects cannot be reliably automated; retain repeatable pure/component coverage where possible.
4. Add failing pure tests for current-kind filtering, empty frequency ranking, prefix/contains ranking, frequency tiebreaks, normalized exact matching, latest recall, no amount/kind recall, and preservation after an unknown edit.
5. Add failing creation-form tests for explicit selection, exact-match blur, Quick Add/new recurring only, no edit autocomplete, existing-only entity choices, retained defaults, and transfer-destination exclusion.
6. Replace native datalist behavior with an accessible deterministic combobox. Phone shows 5 choices; larger screens 8.
7. Add failing Search/dialog geometry/focus tests for the researched architecture.
8. Repair general iOS sheet focused-field visibility and global Search in the same batch.
9. Global Search on phone: immediate autofocus/keyboard, near-top safe-area overlay, input at top, internally scrolling results filling visible space above keyboard.
10. Validate repeatedly on real iOS: long-sheet bottom fields, autocomplete list, global Search, focus/type/scroll/dismiss/reopen cycles, Safari and Home Screen PWA.
11. Record the final hardware matrix and results in the PR/handoff.

### PR 3 — Compact page hierarchy + Dashboard structural redesign

1. Add failing component/source/e2e tests for compact direct screen-name headings and mobile/desktop visibility rules.
2. Replace editorial titles app-wide with compact 20–24px screen-name `<h1>` headings.
3. Phone non-dashboard header: title + one header action only. Hide eyebrow/explanation. Desktop may retain explanatory context.
4. Keep the existing two-row FilterBar unchanged.
5. Add failing Dashboard header/control tests: title/period/overflow row; horizontal tabs row; Compare inside period picker; active chip summarizes both windows; customize/manage in overflow.
6. Preserve two stacked full widget copies for phone comparison.
7. Add failing dashboard-layout migration/invariant tests before changing the pinned balance rule.
8. Remove Overall Balance's mandatory/pinned/always-first invariant without losing existing synced order/settings.
9. Give Overall Balance standard card/header/collapse/menu chrome; allow move/hide/restore like any widget.
10. Keep default/starter curation free to include it.
11. Do not apply provisional gap/padding/top-inset tuning in this PR.

### PR 4 — True-paging architecture decision record; no implementation

Accepted in [`ledger-paging-architecture.md`](ledger-paging-architecture.md). It compares fourteen
architectures and records the selected design, rejected alternatives, invariants, failure analysis,
migration/recovery, fixtures, benchmarks, and phased gate. No paging code belongs in this PR.

### PR 5 — True Ledger paging implementation

Exact internals follow the approved ADR; this plan specifies outcomes, not a premature architecture.

1. TDD additive schema/index/read-model migration and interruption safety.
2. TDD paged repository queries for Newest, Oldest, Largest, Smallest with deterministic ties and mutation/cursor recovery.
3. TDD exact void-chain liveness, pending/template separation, carried balances, and report/usage summaries without a full boot transaction read.
4. TDD initial page sizes: phone 25, desktop 50; same-size increments; automatic near-end load; visible `Load more` fallback.
5. TDD exhaustive progressive Ledger search/filter: never only loaded pages; early matches allowed; generic incomplete state; no early definitive empty/complete state.
6. TDD bounded progressive global Search over the full ledger; top results may improve/reorder until complete.
7. TDD direct fetch/scroll/flash for unloaded focus/deep-link rows.
8. TDD session behavior: preserve leave/return state; filter clear and sort change reset top; local add clears filters/jumps/flashes; remote sync preserves position with `New entries` jump.
9. Prove Dashboard/report figures are exact/current before display; never stale-while-revalidate financial totals.
10. Run replay/materialized-state/migration/sync/reset/import/rollback integrity suites and large-ledger performance tests.
11. Do not ship a runtime legacy fallback or dual-run framework.
12. PR clearly states Ledger-only visible rollout.
13. Implementation agent creates and links a GitHub follow-up issue via `gh` for paged Inbox, Cravings, and other justified long lists.

### PR 6 — Final manual density tuning; do last

1. Only after all structural/behavior work is stable, try phone-only:
   - Non-dashboard section gaps 24px → 16px.
   - Main top inset 20px → 12px.
   - Dashboard widget gaps 24px → 12px.
   - Dashboard card padding 20px → 16px.
2. Add/update responsive behavior tests before CSS where practical; state any visual-only untestable tuning.
3. User hand-tests real phone layouts.
4. Adjust or revert each value independently. None is accepted until manual approval.
