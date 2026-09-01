# Plan: immediate lifecycle sync vs debounced edit sync

## Reported behavior

Lifecycle/network sync should start immediately (sign-in, reconnect, returning to a tab, etc.). Local edits should retain a short debounce so bursts batch into one Drive cycle.

## Code findings

- `dispatchAtom` and `dispatchManyAtom` in `src/features/store.ts` call `scheduleSync(set)` after the local IndexedDB write and atom refresh.
- `scheduleSync` owns one module-level 1500ms timeout and correctly resets it for edit bursts.
- Direct calls to `syncAtom` currently exist for:
  - boot in `bootstrapAtom`;
  - auth sign-in in `src/features/auth/AuthButton.tsx`;
  - auth reconnect in `reconnectAtom`;
  - visibility/focus/45s interval in `src/features/RepoBootstrap.tsx`;
  - manual indicator/banner/command actions.
- Thus several named cases are already direct, but urgency is implicit and untested.
- A pending edit debounce is not cancelled when a direct sync starts. It can cause a redundant second cycle shortly afterward.
- `RepoBootstrap` listens to `visibilitychange` and `focus`, but not `window.online`; recovering network connectivity has no immediate trigger.
- `syncAtom` has a single-flight boolean and drops overlapping calls. This prevents duplication but can defer work if a debounced edit fires during an existing cycle; the 45s interval is then the fallback.
- No focused tests enforce the trigger classes or timer semantics.

## Implementation direction

Introduce a small, pure sync-request scheduler and one explicit immediate atom/API:

- `debounced`: reset a 1500ms timer, used only after local `dispatch`/`dispatchMany`.
- `immediate`: cancel any pending debounce and invoke the sync cycle now.
- Route boot, sign-in, auth reconnect, manual retry/sync, tab visibility/focus, periodic tick, and network `online` through the immediate API.
- Preserve silent-token gating and non-blocking boot.
- Make the single-flight path retain one trailing request rather than dropping it, so changes/events arriving during a cycle get one follow-up cycle, not a 45s wait.
- Keep repeated simultaneous focus + visibility triggers coalesced to at most one trailing cycle.

## TDD sequence

1. Add pure scheduler tests before implementation:
   - repeated debounced requests collapse and use the last callback;
   - nothing runs before 1500ms;
   - immediate request runs synchronously and cancels pending debounce;
   - cleanup cancels pending work.
2. Add single-flight/trailing-run tests before implementation:
   - overlapping requests never execute concurrently;
   - one or many overlapping requests produce exactly one follow-up run.
3. Add wiring contract/component tests before implementation:
   - only local dispatch paths request debounced sync;
   - lifecycle/auth/manual paths request immediate sync;
   - `RepoBootstrap` listens for `online` and removes the listener on cleanup.
4. Run focused Vitest; confirm failures for missing scheduler/immediate API/online listener/trailing cycle.
5. Implement minimal scheduling primitives and rewire callers.
6. Run focused tests until green.

## Validation

- Focused sync scheduler and bootstrap/auth wiring tests.
- Existing `src/sync/*.test.ts`, auth tests, and store-adjacent tests.
- `npm test` after the fix.
- Final full Playwright run for app boot/navigation regressions; real Drive OAuth is outside local e2e credentials.
- Manual connected-device timing check:
  1. Sign in: indicator changes to syncing immediately.
  2. Go offline, edit, return online: sync starts on the `online` event.
  3. Background/foreground the PWA: sync starts when visible.
  4. Make several rapid edits: one sync begins about 1.5s after the final edit.
  5. Focus/online during a running sync: no overlap; at most one trailing cycle.

## Acceptance criteria

- Lifecycle/auth/manual/network triggers never wait for the edit debounce.
- Immediate trigger cancels a pending edit timer.
- Local edit bursts remain debounced at 1500ms.
- No concurrent Drive cycles.
- Work requested during a cycle is not dropped; one trailing cycle runs.
- Event listeners clean up on unmount.

## Risks and mitigations

- A focus and visibility pair can fire together: coalesce via existing/new single-flight trailing flag.
- An immediate sync after an edit must include the already-committed outbox: dispatch awaits local persistence before scheduling, so cancelling only the timer is safe.
- Auth restore cannot open a popup: leave `syncAtom` silent-token gating unchanged.
- Fake timers can hide promise ordering: explicitly flush microtasks in tests.

## Unresolved questions

None.
