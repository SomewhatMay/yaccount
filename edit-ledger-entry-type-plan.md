# Edit ledger entry type/category plan

## Feedback

Editing a non-transfer ledger entry must expose an Expense/Income selector like the
new-entry form and must show only categories belonging to the selected type.

## Current code path

- `src/features/ledger/LedgerView.tsx` owns the selected transaction and passes it,
  all categories, all containers, and all transactions to
  `EditTransactionSheet`.
- `src/features/ledger/EditTransactionSheet.tsx` routes transfers to
  `TransferForm` and categorized entries to `EditForm`. This split already keeps
  transfers outside the requested income/expense behavior.
- `EditForm` currently ranks one `active` list containing every non-archived
  category plus the transaction's archived current category. Its category select
  therefore mixes expense and income categories and appends `· expense` or
  `· income` to compensate.
- The current field label derives from the selected category (`Source` for income,
  `Vendor` otherwise), and amount validation also derives from that category.
- `src/features/shell/QuickAddSheet.tsx` provides the reference interaction: a
  single-select `ToggleGroup`, pill-shaped styling, sentence-case Expense/Income
  labels, and category options restricted by `useComposeFields.categoriesOfKind`.
- `src/features/ledger/useComposeFields.ts` resets the pinned sign and incompatible
  category when Quick Add changes kind. `defaultSign` maps expense to `-` and
  income to `+`, while the sign control still permits refunds and other unusual
  directions.
- `e2e/critical-flows.spec.ts` already has helpers for creating expense/income
  categories, logging an expense, and opening a ledger row's Edit action. The
  suite runs in desktop and mobile Playwright projects.

## Intended behavior

1. A categorized entry edit sheet starts on the type of its saved category.
2. A two-choice Expense/Income segmented selector appears near the top, matching
   Quick Add's established control language. Transfer edits remain unchanged.
3. The Category dropdown contains ranked categories of the selected type only.
   The current archived category remains available only while it is the saved
   category and its type remains selected, preserving an old entry without
   reopening all archived categories.
4. Switching type selects the highest-ranked available category of that type,
   clears any stale warning/error, updates Vendor/Source copy, and returns the
   amount direction to that type's default. The user may still override the sign.
5. If the selected type has no category, Category is empty with a type-specific
   placeholder and Save reports the existing `Pick a category.` validation.
6. Saving uses the chosen category and resolved sign through the existing
   `updateTransaction` command. No model or oplog shape changes are needed.

## TDD sequence

1. Add a Playwright regression that creates one expense category and one income
   category, logs an expense, and opens Edit.
2. Assert the sheet starts with Expense selected; opening Category shows the
   expense category and excludes the income category.
3. Switch to Income; assert Source replaces Vendor, Category selects/shows only
   the income category, and saving produces a positive income row.
4. Run that targeted test before implementation and record the expected failure:
   the edit sheet has no Income type radio.
5. Implement the smallest state/filter/control change in
   `EditTransactionSheet.tsx`, reusing `CategoryType`, `ToggleGroup`,
   `ToggleGroupItem`, `defaultSign`, and existing usage ranking.
6. Re-run the targeted Playwright test, then `npm test`. Run typecheck/lint as
   focused safety checks because the change adds typed UI state and imports.

## UX and accessibility constraints

- Reuse the compact segmented visual from Quick Add; do not introduce a new
  control style or redesign the sheet.
- Keep visible labels and explicit accessible names for Type and Category.
- Preserve keyboard interaction supplied by Radix `ToggleGroup` and `Select`.
- Keep the existing small-screen sheet layout and footer behavior.

## Acceptance criteria

- Expense edit: only expense categories are options.
- Income edit: only income categories are options.
- Switching type updates the field language, category, default sign, and saved
  transaction direction.
- Transfers cannot be converted accidentally and retain their existing form.
- Existing archived-category preservation remains limited to the entry already
  using that category.
- Targeted Playwright passes on desktop and mobile; full Vitest suite passes.

## Risks and checks

- A stale category ID after type switching would silently save the old type;
  selecting/resetting the category in the same handler prevents this.
- Retaining the old explicit sign would trigger an unnecessary unusual-direction
  warning after a type switch; resetting it mirrors Quick Add.
- A type with zero categories must not fall back to a category of the other type.

## Unresolved questions

- None.
