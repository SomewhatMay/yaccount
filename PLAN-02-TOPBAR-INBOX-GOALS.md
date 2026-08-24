# Plan 2 — move Inbox to topbar; promote Goals

## Feedback

> Inbox should be top right on topbar. New opened slot should be taken up by goals.

## Confirmed current state

- `src/features/shell/nav.ts` defines all routes once in `DESTINATIONS` and derives the mobile
  surfaces. `TAB_SLOTS` is currently Home, Ledger, Inbox, More; Inbox owns `badge: "pending"`.
- `MORE_DESTINATIONS` is presently every destination absent from `TAB_SLOTS`. A direct Inbox
  topbar link therefore requires teaching this derivation about topbar destinations; otherwise
  Inbox would be duplicated in More after leaving the tabs.
- `src/features/shell/BottomTabBar.tsx` reads `pendingCountAtom` only to render Inbox's badge.
- `src/features/shell/TopBar.tsx` currently has no route link or pending-count atom.
- `src/features/shell/SidebarRail.tsx` already shows Inbox and its pending badge on desktop. The
  requested topbar placement does not make the rail unsafe; the rail remains the desktop's full
  destination map.
- `src/features/shell/nav.test.ts` explicitly locks the old tab order and old More derivation.
  This feedback supersedes that dated lock.
- `src/features/shell/BottomTabBar.test.tsx` mocks pending count even though it tests touch
  activation only.

## Intended behavior

- Mobile tabs become Home, Ledger, Goals, More, in that order.
- Add Inbox as an icon-only topbar link at every width, directly before the rightmost Search
  action.
- Move the live pending-count badge with Inbox. Its accessible text remains `<n> pending`.
- Exclude Inbox from More because it is now always directly visible. Exclude Goals because it is a
  tab. More becomes Plan, Recurring, Containers, Categories, Settings.
- `/goals` activates Goals. `/inbox` activates no bottom slot. Routes stay unchanged.
- Keep Inbox in the desktop rail as part of the full destination registry and keep its badge.

## Data shape

- Add an explicit `TOPBAR_DESTINATIONS` export in `src/features/shell/nav.ts`, currently containing
  Inbox. Derive it from `DESTINATIONS` rather than restating its label/icon/hint.
- Derive `MORE_DESTINATIONS` by excluding both routed tab slots and topbar destinations.
- This preserves the reachability invariant as:

  `routed tabs ∪ topbar destinations ∪ More = DESTINATIONS`.

## TDD cycles

### Cycle 1 — registry and active state

1. RED: update `src/features/shell/nav.test.ts` before implementation to specify the new feedback:
   Home/Ledger/Goals/More, Goals routes to `/goals`, no tab badge, Inbox is the sole topbar
   destination, revised More order, and the three-surface reachability union.
2. Change active-state expectations: `/goals` returns `/goals`; `/inbox` returns `null`; Plan and
   Settings still return `more`.
3. Run the file. Expected failures: old Inbox tab, absent `TOPBAR_DESTINATIONS`, old More list.
4. GREEN: make the minimum `nav.ts` data/derivation changes.
5. Run `npm test`.

### Cycle 2 — Inbox link and badge

1. RED: extend `src/features/shell/TopBar.test.tsx`. Mock `pendingCountAtom` with a positive count.
   Assert the topbar contains an `/inbox` link, `Inbox` accessible name, pending badge, and link
   order immediately before Search.
2. Run the file. Expected failure: no Inbox link.
3. GREEN: read `pendingCountAtom` in `TopBar`; render the registry's Inbox icon/link and badge.
4. Remove pending-count state and badge rendering from `BottomTabBar.tsx`.
5. Run `npm test`.

## Playwright

- Mobile: assert visible Goals tab, absent Inbox tab, visible `Inbox` topbar link, and direct
  navigation to `/inbox`.
- Generate a pending recurring occurrence using the existing Inbox flow and assert the badge is on
  the topbar link, not a tab.
- Desktop: retain full rail reachability; assert topbar Inbox link does not break the rail's current
  marker.

## Documentation

- Replace the old locked mobile order in spec §9.4.
- Update `AppShell.tsx`, `BottomTabBar.tsx`, `TopBar.tsx`, and `nav.ts` comments.
- Update `yaccount-implementation-details.md` UI map only if it names the old slots.

## Acceptance

- Goals takes Inbox's former thumb slot.
- Inbox is one tap from every screen through the sticky topbar.
- Pending count remains live and attached to Inbox.
- No duplicate Inbox row appears in More.
- Every destination remains reachable below `lg`.

## Commit

- Minimum one commit: `Move Inbox to topbar`

## Unresolved questions

- None.
