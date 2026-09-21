# Ledger notes search plan

## Feedback

The Ledger's `Search entries` field must find text stored only in transaction
notes.

## Current code path

- `src/features/ledger/LedgerView.tsx` converts the filter draft through
  `toFilter`, then calls `applyFilter(live, filter, { label: labelOf })`.
- `labelOf` supplies category, source-container, and destination-container names.
  It intentionally leaves lookup-table text in the view because the engine has
  no category/container tables.
- `src/core/engine/filter.ts` owns the shared transaction predicate.
  `matchesText` currently builds its haystack from `t.vendor_source` and the
  optional caller label only. `t.notes` is therefore never considered by Ledger
  filtering.
- `matchesWords` already supplies the desired semantics: case-insensitive,
  whitespace-tokenized, every term required, terms allowed in any order.
- `Transaction.notes` is nullable and already rendered beneath the ledger row in
  `LedgerView.tsx`.
- Global command-palette search is separate. `src/core/engine/search.ts` already
  indexes transaction notes, and `e2e/critical-flows.spec.ts` already verifies a
  notes-only command-palette result. That behavior should not be changed.
- `src/core/engine/filter.test.ts` is the direct unit seam for text matching.
  Existing fixtures need only accept a `notes` override to express this case.

## Intended behavior

1. Ledger text search includes `Transaction.notes` in the same haystack as payee,
   category, and container names.
2. Matching retains existing word semantics. A multiword query may span fields
   (for example, one word in Vendor and one in Notes) because all searchable row
   text forms one haystack.
3. Null/empty notes behave as empty text and do not affect existing matches.
4. Category, container, kind, date, amount, sorting, empty-state, and command
   palette behavior remain unchanged.

## TDD sequence

1. Extend the transaction fixture in `src/core/engine/filter.test.ts` with an
   optional notes value.
2. Add failing unit cases for a notes-only word, case-insensitive notes, and a
   query spanning vendor and notes. Retain a nonmatching assertion.
3. Run the targeted Vitest file and confirm failure because `matchesText` omits
   notes.
4. Add a Playwright regression that logs an entry whose unique token exists only
   in Notes, types it into `Search entries`, and verifies that row remains while
   another row disappears. Run it before implementation and confirm failure.
5. Make the minimal engine change: include `t.notes ?? ""` in the
   `matchesText` haystack. Update the adjacent API comments to describe notes.
6. Re-run targeted unit and Playwright tests, then `npm test`.

## Acceptance criteria

- A notes-only term finds its ledger row.
- Matching is case-insensitive.
- Multiple terms can match across vendor/category/container/notes text.
- A nonmatching notes term yields the existing filtered empty state.
- Existing category/container/payee matches continue to pass.
- Command-palette notes search stays passing.
- Targeted Playwright passes on desktop and mobile; full Vitest suite passes.

## Risks and checks

- Do not modify `labelOf` to duplicate notes: notes belong to the transaction and
  should be searchable for every caller of the shared predicate.
- Use a space between fields so adjacent values cannot create accidental tokens.
- Keep filtering pure and clock-free; no index or persistence migration is
  required.

## Unresolved questions

- None.
