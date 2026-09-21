# Archived entry container options plan

## Feedback

Archived containers must not appear as selectable options in entry dropdowns.

## Current code path

- New entries use `QuickAddSheet` plus `useComposeFields`. The hook computes
  `activeContainers` by filtering `!c.is_archived` before usage ranking, and both
  ordinary Container and transfer From/To dropdowns render that list. This path
  already meets the feedback and needs regression coverage, not a behavior
  rewrite.
- Ledger edits use `EditTransactionSheet`. Its local `selectableContainers`
  helper currently filters to active containers **or** IDs passed through
  `keep`.
- `EditForm` passes the current `tx.container_id` to `keep`.
- `TransferForm` passes both current endpoints to `keep`. Consequently an
  archived container attached to an old entry is deliberately reinserted into
  the open option list, which conflicts with the feedback and with the Containers
  screen copy: archived containers are "Out of your pickers" while past
  transactions keep their history.
- Both edit forms resolve selected container objects from the full `containers`
  array during save. Therefore an unchanged historical entry can retain its
  archived container without presenting that container as a new selectable
  option.
- `ContainersView` exposes the full E2E archive flow: row action `Archive`, a
  confirmation dialog, and archived rows under the `Archived` section.

## Intended behavior

1. Every option list used to create or edit a ledger entry contains active
   containers only.
2. Ordinary edit Container, transfer edit From, and transfer edit To exclude all
   archived containers, including an archived endpoint already stored on that
   transaction.
3. An existing archived selection remains visible as the current historical
   value in the closed trigger and remains unchanged when the user saves without
   choosing a replacement. It is not rendered as an option when the list opens.
4. After the user chooses an active replacement, the archived value cannot be
   reselected unless restored from the Containers screen.
5. Transfer destination still excludes the currently selected source, preserving
   the distinct-endpoint rule.
6. Category archive behavior is out of scope; edit currently preserves the
   transaction's archived category so old categorized entries remain editable.

## TDD sequence

1. Add a Playwright regression that creates a container, logs an ordinary entry
   to it, archives it, opens Quick Add, and verifies it is absent from the new
   entry Container options.
2. Open the historical entry's edit sheet. Verify the closed trigger identifies
   the archived current container, then open it and verify the archived container
   is absent from options while General remains selectable.
3. Cover transfer From/To options in the same regression or a focused companion:
   archive one endpoint after logging a transfer, then verify neither edit option
   list offers the archived container.
4. Run the targeted Playwright test before implementation. The edit assertion
   must fail because `selectableContainers(...keep)` currently re-adds archived
   endpoints; the Quick Add assertion should pass as a useful control.
5. Replace the edit option policy with active-only ranking. Render the selected
   historical container name explicitly in each closed trigger so removing its
   `SelectItem` does not erase context.
6. Re-run targeted Playwright on desktop and mobile, then `npm test`, typecheck,
   and lint.

## Acceptance criteria

- Quick Add expense/income Container options exclude archived containers.
- Quick Add transfer From/To options exclude archived containers.
- Edit transaction Container options exclude archived containers.
- Edit transfer From/To options exclude archived containers.
- Historical rows still display their archived container in the ledger.
- Opening an edit preserves the current historical value; an unchanged save does
  not move the row.
- Active choices remain usage-ranked and transfer endpoints remain distinct.
- Targeted Playwright passes on desktop and mobile; full Vitest suite passes.

## Risks and checks

- Radix `SelectValue` normally derives text from a matching `SelectItem`; removing
  the archived item requires explicit trigger text for the saved selection.
- The save lookup must continue using the full container array, not the option
  list, or unchanged historical transfers would fail validation.
- Avoid changing the default-container resolution in `store.ts`; it already
  rejects archived defaults for new entries.

## Unresolved questions

- None.
