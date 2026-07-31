# Product quality phases

## Goal

Address the iPhone PWA findings in isolated, reviewable phases. One phase per branch,
commit, test pass, PR, and merge. Start every phase from freshly pulled `main`. Stop for
user approval before committing, per `HANDOFF.md`.

## Shared workflow

For each phase:

1. Read `HANDOFF.md` and this file.
2. `git switch main && git pull --ff-only`, then create the named branch.
3. Write failing tests first and confirm the relevant failure.
4. Implement only that phase. Preserve reset-generation and Drive safety rules.
5. Run focused tests, then:

   ```bash
   npm test
   npm run typecheck
   npm run lint
   npm run build
   npm run test:e2e
   ```

   Prefix npm/npx with the WSL Node bin as documented in `HANDOFF.md`.
6. Report changes and a short manual test list. Wait for approval.
7. After approval: commit concisely, push, open PR with `gh`, merge with `gh`, update
   docs on `main` if needed.
8. Give the user a fresh-context prompt for the next phase.

Do not combine phases because a later phase looks small.

## Phase 1 — Blocking data operations

Branch: `fix/blocking-data-operations`

Scope:

- Add an app-level, modal busy overlay for clear, import, and rollback.
- Show operation-specific progress text plus: “Keep yaccount open until this finishes.”
- Trap focus, block pointer/keyboard interaction behind it, prevent dismissal, and expose
  `role="alertdialog"`/live status semantics.
- Set busy before closing the destructive confirmation. Keep it active through local
  replacement, Drive work, refresh, and restore-point reload.
- On success, remove the overlay only after all work finishes. On failure, remove it and
  leave a persistent, actionable error message; do not imply completion.
- Guard duplicate execution and navigation/reload with `beforeunload` while busy. Do not
  claim the browser can absolutely prevent PWA closure.
- Reuse this mechanism for all world-replacement operations, not file validation/export.

Tests:

- Busy state begins synchronously and spans the complete async task.
- Overlay cannot close and background controls are unavailable.
- Correct clear/import/rollback copy and keep-open warning.
- Success and failure both settle safely; duplicate confirmation cannot run.
- Existing reset and sync suites remain green.

Manual checks:

- Clear, import, and rollback on iPhone PWA and desktop.
- Try tapping nav/FAB, pressing Escape, swiping, and re-triggering during work.
- Test connected, disconnected, slow network, and forced failure.
- Confirm other devices converge after clear/import.

## Phase 2 — iPhone PWA interaction fixes

Branch: `fix/ios-pwa-interactions`

Scope:

- Give the bottom navigation a nonzero fallback plus
  `env(safe-area-inset-bottom)` padding. Verify the viewport metadata permits safe-area
  insets and keep page/FAB offsets matched to the resulting bar height.
- Fix long-press selection on the FAB/chooser with narrowly scoped
  `user-select: none`, `-webkit-user-select: none`, and touch gesture handling. Do not
  disable selection globally.
- Fix autofocus fields hidden by the iOS keyboard at the shared `ResponsiveSheet` layer.
  The known failure is opening a Radix bottom sheet and focusing before iOS completes its
  visual-viewport resize ([Radix issue](https://github.com/radix-ui/primitives/issues/2323)).
- Preserve intended autofocus. After open/focus and visual viewport resize, scroll the
  focused control into the visible sheet region. Make bottom-sheet height/scrolling react
  to `window.visualViewport`; clean up listeners. Desktop/right sheets must not jump.
- Cover all autofocus sheets, not only New category.

Tests:

- Static/layout tests for safe-area fallback and FAB selection prevention.
- Unit tests for visual-viewport sizing/listener cleanup and focus reveal helper.
- Existing pointer, keyboard, and sheet accessibility behavior remains intact.

Manual checks:

- Installed iPhone PWA in portrait and landscape.
- Open New category, New container, icon search, quick add, and rename; focused input and
  primary action remain reachable above keyboard on first open.
- Test keyboard show/hide twice, sheet scrolling, rotation, and larger text.
- Hold FAB over header/list text; no selection, chooser opens once.
- Check home indicator clearance on iPhones with and without an inset.

## Phase 3 — Deliberate feedback, fewer toasts

Branch: `refactor/deliberate-feedback`

Policy:

- Keep toasts for failures requiring attention, external/long-running completion,
  destructive actions with useful recovery, and exceptional state changes.
- Remove routine success toasts when the visible UI already confirms the change:
  create, rename, edit, toggle, budget update, icon change, and ordinary logging.
- Prefer inline validation beside the relevant field. Keep a toast only when no stable
  inline location exists.
- Preserve useful undo actions for delete/archive/dismiss flows. Do not remove feedback
  solely to reduce a count.
- Data replacement completion belongs to Phase 1’s blocking result UI.

Implementation:

- Inventory every `toast` call and record keep/remove/replace rationale in tests or a
  short policy comment.
- Add a small shared inline error pattern where sheets currently use validation toasts.
- Keep global persistence/sync/auth errors centralized and nonduplicated.

Tests:

- Routine mutations do not emit success toasts.
- Errors and undo-capable destructive actions still do.
- Forms retain input and expose accessible inline errors after failed validation/save.

Manual checks:

- Log/edit/create/rename/toggle common entities; UI confirms without toast noise.
- Trigger invalid fields, storage failure, auth failure, delete/archive undo, and export.
- Verify no action is silent when its result is not otherwise visible.

## Phase 4 — Usage-ranked selectors

Branch: `feat/usage-ranked-selectors`

Definition:

- Rank categories by count across active, non-template, non-pending ledger entries.
- Tie-break by most recent use, then locale-aware name, then stable ID.
- Rank containers similarly from active entry participation, counting both transfer
  endpoints.
- Unused options remain alphabetical. Archived options stay excluded unless the current
  control explicitly supports archived rows.
- Apply ranking to action selectors and filters. Do not reorder management pages,
  reports, or already chronological lists.
- Recompute from existing transactions; add no persisted counters or migration.

Implementation:

- Add pure shared ranking helpers in the engine/features seam.
- Use them in quick add, transaction edit, recurring entry setup, inbox categorization,
  category filters, and comparable container selectors.
- Keep type partitions intact: an expense chooser ranks expense categories only.
- In multi-select filters, selected state must not change ranking or make rows jump while
  the menu is open.

Tests:

- Counts, void/undo handling, templates, pending rows, recency ties, alphabetical ties,
  transfers, archived rows, and deterministic output.
- Every selector receives ranked options without changing its filtering rules.

Manual checks:

- Build recognizable usage history, then inspect every category/container chooser.
- Confirm newest tie-break, unused alphabetical tail, type separation, filters, and
  archived behavior.
- Add/edit/void transactions and verify order updates on the next open.

## Phase 5 — Starter categories

Branch: `feat/starter-categories`

UX decision:

- Offer one curated “Everyday starter” set instead of lifestyle/persona templates. A
  single recommendation minimizes onboarding decisions and avoids pretending the app
  knows the user’s life.
- Show it only in the empty Categories state: primary “Use a starter set,” secondary
  “Create one myself.” Existing users do not get a recurring upsell or accidental
  duplicate path.
- Open a review sheet before writing. Group Expense and Income; preselect a compact,
  useful set; allow individual toggles, Select all/Clear, and name/icon preview.
- Suggested set:
  - Expense: Housing, Groceries, Dining, Transport, Utilities, Health, Shopping,
    Entertainment, Subscriptions, Giving, Travel, Other
  - Income: Paycheck, Other income
- Explain: “Choose what fits. Rename or archive these anytime.” No budgets or assumptions
  about amounts are created.
- Disable continue with zero selected. “Add N categories” is the explicit commit point.
- Create all selected categories as one user intent with deterministic uniqueness checks.
  If any write fails, avoid a misleading partial-success UI and make retry safe.
- After success, land on the populated Categories page with no celebratory toast; the new
  rows are the confirmation.

Data/design constraints:

- Keep templates as code-owned immutable definitions, not synced template records.
- Generate normal category-create operations so sync/export/import remain unchanged.
- Use stable template keys only for UI/tests; generated categories receive normal IDs.
- Do not silently install defaults at first launch. The user chooses.
- No localization architecture in this phase, but isolate labels so it can be added later.

Tests:

- Empty-state entry point only; custom-create path remains.
- Defaults, grouping, toggle controls, zero-selection guard, accessible labels.
- Normal categories/ops created with correct type/icon; no duplicate names.
- Retry/partial-failure behavior and sync/export compatibility.
- Existing-data state does not show starter onboarding.

Manual checks:

- Fresh install: accept defaults, customize heavily, choose one, choose none, cancel.
- Confirm rename/archive immediately works and categories sync to another device.
- Confirm refresh/reopen during review creates nothing.
- Confirm established account never sees starter onboarding.

## Completion

After Phase 5, run the full verification suite once more on `main`, smoke-test the
installed iPhone PWA, and update `HANDOFF.md` with shipped state and any remaining device
limitations.

## Unresolved questions

None.
