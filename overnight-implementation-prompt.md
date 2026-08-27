# Overnight implementation loop prompt

You are the implementation agent for `/home/may/github/yaccount`. The user is unavailable overnight. Do not ask questions. Make the best safe judgment, document assumptions, and keep progressing through every independent group you can complete.

## Objective

Execute the approved plan in `next-features-build-plan.md` end to end through small sequential branches and PRs. For each group: fresh branch from updated `main`, strict TDD, implementation, meaningful commits, full verification, PR, merge, return to/pull `main`, then start the next group.

The approved plan is authoritative. Read it completely before any task action. Also read `AGENTS.md`, `HANDOFF.md`, `yaccount-implementation-details.md`, and relevant spec/code before each group. Preserve all user work.

## Non-interactive operating rules

- Never ask the user a question. Use repository evidence and best judgment.
- Do not weaken a safety/research/manual-validation gate merely to keep moving.
- If one group is genuinely blocked after exhaustive safe work, document the blocker in a concise GitHub issue or draft PR, leave `main` safe, and continue only with independent later groups.
- Never claim testing or hardware validation you did not perform.
- No destructive git/data commands. Never drop/rebuild user data without the approved guarded/recoverable design.
- GitHub operations use `gh`.
- Messages, commits, branches, PRs: extremely concise. No co-author/assistant/Codex mentions.
- Preserve frequent meaningful commits. Merge PRs with merge commits, not squash, unless repository policy prevents it.
- Never merge failing checks, known correctness failures, or unresolved data-integrity risk. The docs-only bootstrap PR below is the sole exception for the inherited local Playwright baseline; it may not contain code, CI must be green, and baseline repair must immediately follow.

## One-time preflight

1. Read all instructions and the full approved plan.
2. Inspect `git status`, branch, remotes, `gh auth status`, Node/npm provenance, `.env`, dependencies, and baseline tests.
3. Ensure WSL Linux Node/npm are used; never Windows `node.exe`/`npm`. `gh auth status` must succeed before starting. If it does not, record the blocker and stop; do not build a stack of unpushable branches.
4. If `next-features-build-plan.md` and this prompt are still untracked, first treat them as a docs group:
   - Branch `docs/approved-next-features-plan` from `main`.
   - Commit only these two docs.
   - PR, verify, merge, delete branch, return to updated `main`.
5. Before every group, require clean updated `main`: `git switch main`, `git pull --ff-only`, `git status --short`.

## Required loop for every behavior group

1. Create a concise branch from fresh `main`.
2. Re-read the relevant approved-plan section and inspect existing implementation/tests.
3. Write the smallest failing test first.
4. Run it and confirm it fails for the intended missing behavior. Never implement first. Never edit a test merely to make broken code pass.
5. Implement the minimum code to pass.
6. Repeat in small vertical slices. Commit each coherent slice with a concise meaningful message.
7. Run targeted tests throughout.
8. Before PR, run:
   - `npm test`
   - `npm run typecheck`
   - `npm run lint`
   - `npm run build`
   - `npm run test:e2e`
9. Follow `HANDOFF.md` e2e cautions: four workers; do not immediately loop e2e; ensure port 3100 is clear between runs. Also verify no live Next dev process owns this repo and no stale `.next/dev/lock` remains; only remove a lock after proving its recorded PID is dead.
10. Production builds need outbound access to Google Fonts. If sandbox networking blocks it, use the approved/safe escalation path instead of treating it as a product failure.
11. Review diff, `git diff --check`, status, migration/data invariants, accessibility, mobile behavior, and accidental unrelated changes.
12. Push branch; create concise PR explaining outcome, TDD evidence, tests, risks/manual checks, and follow-ups.
13. Wait for required checks. Fix failures on the same branch with new meaningful commits.
14. Merge via `gh pr merge --merge --delete-branch` when green and safe.
15. Return to `main`, pull `--ff-only`, confirm clean, then continue.

Docs/config-only work may skip TDD only where `AGENTS.md` permits. Still verify proportionately.

## Group order

### 0. Approved plan docs, only if untracked

Branch: `docs/approved-next-features-plan`

Commit/merge the approved plan and this prompt without unrelated files. This docs-only bootstrap may merge while the inherited local Playwright baseline is red if required GitHub checks are green; state the exact inherited result and do not imply full green. Do not spend another back-to-back e2e run on this docs-only branch.

### 0.5. Baseline repair, if still failing

Branch: `fix/baseline-e2e`

Do not begin feature work against a red baseline. On 2026-08-27, clean `main` passed 1,279 unit tests, typecheck, lint (one existing `AuthButton.tsx` hook warning), and production build, but Playwright ended with 81 passed, 15 failed, and 10 skipped. Several failures reported the Next dev-tools portal intercepting pointer events; others covered dashboard period math, FAB holds, selects, and mobile controls. A stale `.next/dev/lock` was proven dead and moved out before that run, so do not misdiagnose the old lock as the test failures.

After the docs PR, reproduce once from clean updated `main`, respecting the no-back-to-back rule. If failures persist, diagnose product defects versus harness/environment defects. Repair them in this isolated branch with the same test-first discipline; do not delete, skip, loosen, force-click through, or inflate timeouts to hide failures. Add focused regression coverage where needed. Merge only after the full baseline is honestly green. If the run is green, skip this group.

### 1. Local diagnostics

Branch: `feat/local-diagnostics`

Execute approved PR 1. Before code, deeply research battle-tested local-only browser/PWA logging for a one-developer, no-backend app. Compare several simple designs; choose the smallest proven shape. No enterprise observability. Persist independently from the financial DB; 2,000 records/14 days; strategic diagnostics only; no analytics/no financial content; copy/download; exact linked commit/build metadata; boot/global failure access; one production policy; notification alignment. TDD all behavior. Performance-test logging overhead.

### 2. Add-form autocomplete

Branch: `feat/add-form-autocomplete`

Implement the approved creation-only autocomplete behavior across vendor/source, category, container, and transfer destination. Quick Add and new recurring only; edit flows remain non-autocomplete. Use accessible existing-only comboboxes, exact-match blur recall, current-kind/frequency/prefix rules, latest category/container recall, no amount/kind recall, defaults retained, 5 phone/8 larger visible results. Strict pure + wiring TDD.

### 3. iOS keyboard + global Search

Branch: `fix/ios-keyboard-search`

Before code, continue deep current online research into iOS Safari/Home Screen PWA keyboard, focus, Visual Viewport, fixed dialog, and known WebKit issues. Reproduce first on real iOS hardware if such access actually exists. Batch the general long-sheet focused-field fix with global Search: autofocus, near-top safe-area overlay, input at top, results fill/scroll above keyboard. Add automated geometry/focus coverage where honest. Repeat real-device Safari/PWA cycles if available and record exact matrix. If real iOS hardware is unavailable, do not fake approval: complete only work supportable by research/tests, state the hardware-validation gap prominently in PR, create a concise follow-up issue, and keep moving safely.

### 4. Compact hierarchy + Dashboard redesign

Branch: `feat/compact-dashboard-layout`

Execute approved PR 3. Compact direct page-name headings; phone title/action; desktop context; existing two-row filters. Dashboard row 1 title/period/overflow; row 2 horizontal tabs; Compare inside one period picker; stacked comparison copies. Remove Overall Balance pinned invariant through tested backward-compatible layout handling; give standard widget chrome and move/hide/restore. Do not apply final density tuning here.

### 5. True-paging ADR only

Branch: `docs/ledger-paging-architecture`

Execute approved PR 4. This is a hard gate and must be its own reviewed PR with no paging implementation. Spend substantial time on at least 10 materially different architectures, rejection rationale, invariants, data-loss failure analysis, migration/recovery, benchmarks/fixtures, and phased design. Cover every item in the approved architecture gate. Never make a hasty choice. If correctness is not demonstrable, do not proceed to paging implementation.

### 6. True Ledger paging

Branch: `feat/ledger-true-paging`

Proceed only from the merged approved ADR. Execute approved PR 5 exactly; internals follow the ADR, not assumptions in this prompt. Strict TDD for additive migration, all sorts, exhaustive progressive search/filter, exact liveness/carried balances/reports/rankings, deep links, session behavior, sync changes, page sizing/loading/fallback, and data-tool/sync/replay integrity. Large-ledger performance tests required. No runtime legacy fallback/dual-run framework. Visible rollout is Ledger only. Create/link the required follow-up GitHub issue via `gh` for Inbox, Cravings, and other justified long lists.

### 7. Final provisional density tuning

Branch: `style/mobile-density-tuning`

Do this last. Try only the four approved phone values: section gaps 16px, main top inset 12px, dashboard widget gaps 12px, card padding 16px. Keep desktop roomier. Test/screenshot available phone viewports and adjust only for clear breakage. This remains provisional pending the user's later real-phone hand review; state that prominently in PR and create a concise manual-review follow-up issue/checklist. The overnight authorization permits merge after automated/visual checks, but do not describe the values as finally hand-approved.

## Completion

After the last safe group:

1. Return to clean updated `main`.
2. Run final full verification once, respecting e2e server cleanup.
3. Confirm all PRs merged, branches cleaned, required follow-up issues linked, and repository clean.
4. Update `HANDOFF.md` concisely with shipped behavior, migrations, test counts, open hardware/manual validation, and issues.
5. If that handoff update is not already in the last PR, use its own docs branch/PR/merge loop.
6. Leave a concise final summary with PRs, commits, tests, issues, and any honest residual blocker. Do not wait for user input.
