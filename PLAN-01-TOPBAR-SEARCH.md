# Plan 1 — put search in the topbar

## Feedback

> Search icon should be top right on topbar.

## Confirmed current state

- `src/features/shell/TopBar.tsx` already owns the global search trigger through
  `commandPaletteAtom`, but its button has `hidden lg:inline-flex`. Search is therefore visible in
  the topbar only at `lg` and wider.
- In that same right-aligned `ml-auto` action cluster, search is currently first. `AuthButton`,
  `SyncIndicator`, and `ThemeToggle` follow it, so search is not the rightmost control.
- `src/features/shell/MoreSheet.tsx` duplicates search in the phone sheet footer. This is the only
  visible touch trigger below `lg`; reaching search requires More, then Search.
- `src/features/AppShell.tsx` mounts one `CommandPalette` globally. No palette state or search
  engine change is needed for this fix.
- `e2e/critical-flows.spec.ts` opens the palette only with `ControlOrMeta+k`; it does not protect a
  visible phone trigger.

## Intended behavior

- Show an icon-only search control in the topbar at every width.
- Keep the existing `⌘K` hint beside the icon at `lg`; hide only the hint below `lg`, not the
  button.
- Put search last in the topbar action cluster. Later plans may remove or add adjacent controls,
  but search remains the right edge action.
- Remove the duplicate Search button from More. Keyboard shortcut and global palette behavior stay
  unchanged.
- Use the direct accessible name `Search yaccount`; the current “Search and jump to a screen” no
  longer describes the action-led blank state planned later.

## TDD cycles

### Cycle 1 — topbar structure

1. RED: add `src/features/shell/TopBar.test.tsx`. Mock `usePathname`, Jotai, auth, sync, and theme
   dependencies; call `TopBar` as a function and inspect its returned React tree.
2. Assert a `Button` named `Search yaccount` exists, its own class does not include `hidden`, its
   keyboard hint is the only responsive-hidden child, and the search button is the last child of
   the right-aligned action cluster.
3. Run the new Vitest file. Expected failure: current button class contains `hidden` and current
   child order puts theme last.
4. GREEN: change only `TopBar.tsx`: keep button visible, move responsive hiding to `<kbd>`, and
   move the trigger to the end of the cluster.
5. Run `npm test`.

### Cycle 2 — remove the redundant More trigger

1. RED: extend `TopBar.test.tsx` with a source regression assertion that `MoreSheet.tsx` neither
   imports `SearchIcon` nor opens `commandPaletteAtom`.
2. Run the test. Expected failure: both imports and the footer button exist.
3. GREEN: remove the search button and now-unused Jotai/search imports from `MoreSheet.tsx`.
4. Run `npm test`.

## Playwright

- Add a mobile-only assertion to `e2e/critical-flows.spec.ts`: the `Search yaccount` topbar button
  is visible on Home, click opens the existing dialog, Escape closes it.
- Run that test on the mobile project, then the full e2e suite at the final gate.
- Desktop shortcut tests remain unchanged and protect `⌘K` behavior.

## Documentation

- Update shell comments in `TopBar.tsx`, `MoreSheet.tsx`, and `store.ts`; they currently say the
  phone opens search from More.
- Update spec §9.4 when the full navigation shape is finalized in Plan 2, avoiding two partial
  edits to the same paragraph.

## Acceptance

- Search is visible without opening More at 390px and desktop widths.
- Search is the rightmost topbar action.
- Clicking it opens the same globally mounted palette.
- More contains destinations/account only, not a duplicate Search button.
- Keyboard focus is visible; icon-only control has an accessible name.

## Commit

- Minimum one commit: `Move search to topbar`

## Unresolved questions

- None.
