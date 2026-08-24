# Plan 5 — action-first search defaults with history

## Feedback

> Searchbar goto is kinda useless. Most of them can be reached by pressing more, then the
> respective button. Replace with a default list of common actions ppl would use it for, and then
> also show a previous history so common actions can be easily repeated.

## Confirmed current state

- `CommandPalette.tsx` hands destinations and actions to `buildSearchIndex` as extras.
- On a blank query it asks the engine for up to 60 results, keeps destinations/actions/recent
  transactions, then truncates to 16. `DocKind` headings render destinations as `Go to` and actions
  as `Do`.
- Because `DESTINATIONS` precede actions in `extras` and destination scoring has a higher kind base,
  navigation dominates the blank state.
- Typed search is broader and useful: the engine finds transactions, notes, amounts, categories,
  containers, goals, recurring rules, shortcuts, actions, and destinations. Existing Playwright
  cases protect this and must remain green.
- `src/features/prefs.ts` is the established browser-local preference boundary. It tolerates SSR,
  blocked storage, and same-tab/cross-tab updates through `useSyncExternalStore`.
- No command-use history exists today.

## Intended behavior

- Blank palette shows only:
  1. `Recent actions`, newest first, when history exists.
  2. `Common actions`, in curated order, excluding actions already shown as recent.
- Common actions are Log an expense, Log income, Move money between containers, each active
  investment's Record investment value action, and Sync with Drive now.
- Selecting an action records its id before running it. Repeating an action moves it to the front;
  no duplicates.
- Persist up to six ids in localStorage. Invalid JSON, non-string values, duplicates, and stale
  action ids cannot break rendering. Stale ids remain harmless or are dropped on the next write;
  only ids resolving against the current action catalog render.
- Typed search remains unchanged in scope, including explicit `Go to` results. The feedback targets
  the default/blank page, not the ability to type a destination.
- Transaction recency no longer fills blank search; transaction/history search still works once
  the user types.

## Persistence design

- Create `src/features/shell/command-history.ts` with:
  - stable storage key `yaccount.command.history`;
  - versioned `{ version: 1, actionIds: [...] }` envelope, so a future parser can migrate one key
    without leaving versioned keys behind;
  - `parseCommandHistory(raw)` returning a safe, deduplicated, capped id list;
  - `rememberCommandAction(history, id)` moving id to front and capping at six;
  - `useCommandHistory()` built on `useLocalPref<string>` using serialized JSON.
- Store stable opaque ids only. Never store labels, query text, timestamps, amounts, container
  names, closures, or result details. Dynamic investment action labels then reflect the live
  container name automatically.
- History is device-local interaction convenience, not account data; do not sync/export it.
- Resolve stored ids against the current in-memory action catalog before rendering. Remove
  unresolved ids from the input to the next history write, so archived investments, imports, and
  account resets cannot accumulate stale references.
- Treat lost last-writer races between browser tabs as acceptable for this noncritical recency
  hint. Keep the established `storage` event subscription so each tab converges on the last write.
- Do not use IndexedDB or the op-log. A command click is not financial/account state; journaling it
  would add sync traffic, unbounded replay data, reset/import semantics, and conflict ordering for
  a six-row convenience list.
- Do not add timestamps. Array order is the required information and avoids clock/conflict logic.

## Backend-less safety constraints

- **Bounded:** one key, six short ids; storage and parse cost cannot grow with ledger size.
- **Fail-open:** missing, blocked, full, malformed, or future-version storage yields empty history;
  common actions still work.
- **No duplicate truth:** action titles and eligibility come only from the live catalog. Storage is
  never authoritative.
- **No sensitive search log:** search terms and selected financial records are never retained.
- **Reset-safe:** stale dynamic ids do not resolve after clear/import/rollback and are compacted on
  the next action selection.
- **SSR-safe:** use the existing `useSyncExternalStore` preference boundary and a stable serialized
  server fallback; do not touch `window` during prerender.
- **Practical consistency:** same-tab listeners update immediately; other tabs use the browser
  `storage` event. Last writer wins is enough because losing an ordering hint loses no account
  data.

## Rendering design

- Keep the search engine and `SearchResult` groups for nonblank queries.
- For blank queries, bypass engine ranking and render action objects directly in two
  `CommandGroup`s. Reuse one `ActionItem` renderer so Recent and Common cannot drift.
- Filter Common by the ids already rendered in Recent. This avoids duplicate cmdk values and makes
  every visible row unique.
- Rename the typed action heading from `Do` to `Actions`; blank headings carry the stronger
  distinction (`Recent actions`, `Common actions`).

## TDD cycles

### Cycle 1 — safe history rules

1. RED: add `src/features/shell/command-history.test.ts`. Assert null/malformed/wrong-shape input
   becomes empty; strings are accepted; duplicates keep first occurrence; list caps at six.
2. Assert remembering adds to front, moves an existing id to front, preserves other order, and
   caps at six.
3. Run the file. Expected failure: module absent.
4. GREEN: implement pure functions/constants only.
5. Run `npm test`.

### Cycle 2 — persistence hook

1. RED: extend history tests around the serialized validator/encoder used with `useLocalPref`.
   Invalid storage must fall back to `[]`; valid storage must round-trip.
2. Expected failure: serialization seam absent.
3. GREEN: add `useCommandHistory()` using existing prefs infrastructure; no new raw localStorage
   access.
4. Run `npm test`.

### Cycle 3 — action-first blank state

1. RED: add `CommandPalette` tree/source coverage or extract a pure `commandDefaultGroups(actions,
   history)` helper. Prefer the pure helper. Assert recent order, stale-id omission, no duplicate in
   Common, and curated remaining order.
2. Run it. Expected failure: helper absent/current blank logic is engine-ranked destinations.
3. GREEN: render blank action groups from the helper; retain existing engine groups only for typed
   queries. Record history in the action selection path.
4. Run `npm test` and all existing search-engine tests.

### Cycle 4 — repeat through real UI

1. RED: add Playwright coverage. On blank search assert Common actions is visible and Go to is not.
   Select Log income, close its sheet, reopen search, and assert Recent actions contains Log income
   while Common contains no duplicate.
2. Reload, reopen search, and assert history persists.
3. Type `settings`; assert Settings still appears under Go to. This guards the deliberate split
   between blank defaults and typed search.
4. Confirm initial failure against current destination-led blank state, then make only wiring fixes
   needed for GREEN.

### Cycle 5 — storage failure behavior

1. RED: add tests for invalid/future payloads, unresolved action ids, and a write after stale ids.
   Assert common actions remain complete and the next stored list contains only current ids.
2. Expected failure: parser/group/write seam retains invalid or stale ids.
3. GREEN: keep schema/version checks and catalog resolution at the pure boundary. Do not add a
   repair effect or background write.
4. Run `npm test`.

## Documentation

- Update `CommandPalette.tsx` module comments and blank-state explanation.
- Update HANDOFF's search summary with action-first defaults and device-local six-item history.
- Update spec §9.4/§9.8: blank command palette is action-led; typed search retains destinations and
  entity search.
- Update `features/prefs.ts` comment if it gains the serialized history use case.
- After all fixes, add `SEARCH-HISTORY-REPORT.md`: a brief ASD-STE100-style report covering stored
  data, non-stored data, failure behavior, efficiency, reset/import handling, and accepted
  last-writer behavior. Keep this report when temporary plans are deleted.

## Acceptance

- Blank palette contains no Go to or recent transaction rows.
- Common actions are immediately visible.
- Used actions appear newest-first under Recent actions, deduplicated and persisted.
- Missing/archived dynamic actions do not render stale history.
- Storage remains bounded and contains no search text, labels, amounts, names, or timestamps.
- Blocked/corrupt storage degrades to no Recent actions; all Common actions remain usable.
- Typing still searches every current kind and can find routes.
- Existing `⌘K` open/close, notes, amount, and focus-link e2e tests remain green.

## Commit

- Minimum one commit: `Add command action history`

## Unresolved questions

- None.
