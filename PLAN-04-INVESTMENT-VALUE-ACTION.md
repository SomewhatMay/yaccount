# Plan 4 — add investment-value search actions

## Feedback

> Searchbar action: record investment value.

## Confirmed current state

- `CommandPalette.tsx` builds actions in-component for expense, income, transfer, sync, and theme.
  It already indexes action title/subtitle through `SearchExtra` and dispatches by stable action id.
- Investment containers are live in `containersAtom`; `Container.is_investment` identifies them and
  `is_archived` controls availability.
- `ContainersView.tsx` owns local `logging: Container | null`. Only a container row's “Reported
  balances” menu can set it.
- `LogBalanceSheet.tsx` already contains the correct record/edit/delete flow, uses `todayIso()`,
  parses cents safely, handles same-day replacement, and shows full history. Building another form
  would duplicate financial behavior.
- `recordSnapshot` and `dispatchAtom` already journal the write. No core/model/op/database work is
  required.

## Intended behavior

- Each active investment contributes a command action:
  - title: `Record investment value`
  - subtitle: container name
  - stable id: `act:investment:<container id>`
- Plain and archived containers do not produce actions.
- Selecting an action closes search and opens the existing Reported balances sheet for that exact
  container, from any route.
- The existing Containers row action opens the same global sheet. One sheet owns report history
  everywhere.
- Multiple investments appear as separate, identifiable options. This avoids a second picker and
  makes both typing a container name and repeating history deterministic.

## State/wiring design

- Add `reportedBalanceContainerAtom: atom<string | null>` in `src/features/store.ts`.
- Add a small `ReportedBalanceSheet` wrapper in `src/features/containers/` that reads the selected
  id, current containers/snapshots, and `dispatchAtom`, then delegates to `LogBalanceSheet`.
- Mount the wrapper once in `AppShell.tsx`, next to other global sheets.
- Replace `ContainersView`'s local `logging` state with writes to the global atom.
- Extract pure investment action descriptors to `src/features/shell/command-actions.ts`; keep React
  icons and closures in `CommandPalette.tsx`.

## TDD cycles

### Cycle 1 — eligible action descriptors

1. RED: add `src/features/shell/command-actions.test.ts` using `makeContainer` fixtures. Assert one
   descriptor for an active investment, none for cash/plain or archived investments, exact stable
   id/title/subtitle/container id, and source order preservation.
2. Run the test. Expected failure: module absent.
3. GREEN: add the pure descriptor builder only.
4. Run `npm test`.

### Cycle 2 — global report target

1. RED: add a tree/source wiring test before implementation. Assert `AppShell` mounts
   `ReportedBalanceSheet`, `ContainersView` writes the shared atom, and `CommandPalette` builds
   actions from the descriptor helper and writes the selected container id.
2. Run it. Expected failures: wrapper/atom/wiring absent.
3. GREEN: add the atom/wrapper, move sheet ownership from ContainersView to AppShell, and wire the
   generated command actions. Give actions a real `subtitle` field instead of hard-coding empty
   strings into `SearchExtra`.
4. Run `npm test`.

### Cycle 3 — user path

1. RED: add a Playwright case: create an Investment container, open search from a non-Containers
   route, select `Record investment value` with the container name, and expect Reported balances
   with its date/value form.
2. Confirm failure because no action exists.
3. GREEN should already follow from Cycle 2. If not, correct wiring only.
4. Fill and save a value; assert it appears in history and on Containers after closing.

## Documentation

- Update `CommandPalette.tsx`, `store.ts`, and `LogBalanceSheet.tsx` ownership comments.
- Update HANDOFF search-action summary after Plan 5 finalizes the palette.
- No spec accounting change; snapshot semantics remain spec §4.5.

## Acceptance

- Active investments are directly searchable by action and container name.
- Choosing one opens the existing report/history sheet without route navigation.
- Saving records the normal journaled snapshot.
- Archived/plain containers never appear.
- Containers row menu still opens the same sheet.

## Commit

- Minimum one commit: `Add investment value action`

## Unresolved questions

- None.
