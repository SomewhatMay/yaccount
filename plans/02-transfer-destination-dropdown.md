# Plan: transfer destination dropdown

## Reported behavior

“To container” should be a dropdown, not a text input.

## Code findings

- Quick Add transfer in `src/features/shell/QuickAddSheet.tsx` renders `To container` with `CreationEntityCombobox`.
- `CreationEntityCombobox` in `src/features/ledger/CreationCombobox.tsx` renders an actual `Input` with `role="combobox"`; it is searchable/editable and opens the software keyboard.
- New recurring transfers in `src/features/recurring/RecurringRuleSheet.tsx` use the same editable combobox for `To container`.
- Existing recurring-transfer edits already use local `ContainerSelect`, backed by Radix `Select`.
- Existing transaction-transfer edits in `src/features/ledger/EditTransactionSheet.tsx` also use Radix `Select` for `To`.
- Both creation forms already filter out the selected source container. That invariant must remain.
- `e2e/critical-flows.spec.ts` currently treats Quick Add destination as an input-backed combobox and does not cover a new recurring transfer destination.

## Scope

- Replace destination selection in Quick Add transfers with Radix `Select`.
- Replace destination selection in new recurring transfers with the already-existing `ContainerSelect` path, making create/edit consistent.
- Keep source/container creation controls searchable; feedback names only the transfer destination.
- Keep destination filtering, selected IDs, validation, payloads, and labels unchanged.

## TDD sequence

1. Add a focused source/component contract test before implementation:
   - Quick Add `To container` uses `SelectTrigger` and not `CreationEntityCombobox`.
   - New and edited recurring transfers share `ContainerSelect` for `To container`.
2. Update/add Playwright expectations before implementation:
   - Quick Add destination has `role=combobox` but underlying tag is `button`, not `input`.
   - Clicking/tapping opens options.
   - Current source is absent; another container is selectable.
   - Add equivalent new recurring transfer coverage if fixture/setup stays stable.
3. Run focused Vitest/Playwright; confirm failure because destination is still an input.
4. Implement the minimum select markup, preserving `aria-label="To container"`, placeholder `To…`, option filtering, and state setter.
5. Run focused tests until green.

## Validation

- Focused new Vitest contract test.
- `npx playwright test e2e/critical-flows.spec.ts --grep "moves money|creation comboboxes|recurring"` for desktop and mobile.
- Full `npm test` after the fix.
- Final full Playwright run.
- Mobile touch check: opening destination must not focus an editable field or show a text caret/keyboard.

## Acceptance criteria

- Quick Add and new/edit recurring transfer destinations are true dropdown triggers.
- Destination cannot be free-typed.
- Selected source is excluded.
- Selection still writes the same destination ID and transfer creation succeeds.
- Source controls remain searchable.

## Risks and mitigations

- Existing helper `choose()` supports both inputs and buttons; explicitly assert the tag to prevent a false-positive test.
- Radix content is portalled; use accessible role/name selectors already established in the suite.
- Long lists must remain touch-scrollable; existing select overflow e2e coverage exercises the same primitive.

## Unresolved questions

None.
