# yaccount — Handoff

> Living handoff for the next agent picking up with fresh context. Update this at each milestone boundary.
> **Last updated:** **M6 (Recurring Rules, Templates & the Inbox) DONE — merged to `main` via PR #5** (merge commit `0e9416e`, 2026-07-21). **User browser-verified** the full flow (create rules of each frequency, backfill into inbox, 1-tap + bulk approve, bulk dismiss + undo, edit-before-approve, pause/resume, templates/shortcuts, forward-looking schedule edits). Typecheck/lint/build/prettier clean; **312 vitest tests green** (was 266 at M5, +46 for M6). **No `DB_VERSION` bump** — `recurring_rules` store existed since M1 (DB_VERSION stays 2). **Next up: M7** (Savings Goals + Monthly Allocation Plan) — the **LAST feature milestone**; M7 needs BOTH M5+M6, now both merged. But confirm milestone choice with the user first (they re-order; see "Next Steps").
> **Prior:** M5 (Reporting & Dashboard) DONE — merged via PR #4; M4 via PR #3; M3 via PR #2; M0–M2 via PR #1.
> **NOTE:** M4 was merged to `main` via **PR #3** (`c2f7804`) since the last handoff — the "not pushed/PR'd" note for M4 below is stale; `main` has M4.
> **NOTE:** this file is now **tracked in git** (commit `88ebfa8`, "Keep handoff on cloud for cross-device development") — the "gitignored, local-only" note below this line is stale from before that change. It's meant to travel with the repo across devices now, so keep committing it at milestone boundaries.
> **NOTE (environment):** the M5 session ran back on **WSL2** (`/home/may/github/yaccount`, Node v22.18.0 via nvm — remember the `export PATH=…` prefix for every npm/npx call). The M4 session was native Windows. Both environments work; update whichever section matches where you're actually running.

> **⚠️ ALWAYS, at the start of every session and before writing any code — even if you've read them before, even if this handoff looks current — open and (re)read in full:**
> 1. `yaccount-tech-spec-v3.md` (source of truth, the "what")
> 2. `yaccount-implementation-details.md` (build plan/order, the "how")
> 3. This `HANDOFF.md`
>
> This handoff is a summary and can drift or omit nuance; the two design docs are authoritative and win on any conflict. Do not rely on memory of a prior read within the same session — re-open the files.

---

## Goal

Build **yaccount**, a local-first personal finance app that replaces a budgeting spreadsheet ("The Measure of a Plan v5"). One static Next.js build runs in the browser today and inside Capacitor (iOS/Android) later. Backend is the user's own Google Drive `appDataFolder` via the `drivestore` npm lib — no server.

**Two design docs are the authority — READ BOTH IN FULL before coding:**
- `yaccount-tech-spec-v3.md` — **SOURCE OF TRUTH** (the "what"). If it contradicts the impl doc, spec wins — flag it, don't silently pick.
- `yaccount-implementation-details.md` — ordered, testable build plan (the "how"/"in what order"). §0 invariants, §7 execution order, §10 adversarial corrections.

Every open decision is already locked (look for "locked"/"RESOLVED"/"✔"). **Do not reopen them.**

### Execution order (impl §7 — sync pulled EARLY; milestone NUMBERS are stable, only order moves)
`M0 → M1 → M2 → M8 → M9 → M3 → M4 → M6 → M5 → M7 → M10 → M11`

v1 ships at **M7** (features + mandatory cloud sync M9). Work ONE milestone at a time; each has Goal·Scope·How-to-test·Exit criteria. **Do not start the next milestone until the current one's exit criteria + tests pass, and WAIT for the user's green light between milestones.**

### Non-negotiable invariants (impl §0 — these gate every milestone)
1. **Op-log write path from M1:** every mutation is an idempotent op `{id, ts, type, payload}` appended to the journal AND applied to IndexedDB materialized state, in a **single IndexedDB transaction**.
2. **Money = integer cents everywhere** (stores, ops, snapshot); decimal only at input/display edges (`money.ts`).
3. **Balance is NOT naive `SUM(amount)`:** `SUM(amount WHERE container_id=c) − SUM(amount WHERE to_container_id=c)` over `inbox_status='approved' AND is_template=false` rows (spec §5.4). Same two caveats apply to `contributed`, Container Flows, Reconstructed Balance.
4. **Never destructively delete/overwrite financial data, and never ship a one-way action** — soft-lifecycle (archive/cancel/complete); corrections are reversing rows (`transaction.void`). Transactions have NO `is_archived` field. **REVERSIBILITY IS THE PRODUCT'S SPINE — spec §1.1 (read it).** Every action has a visible inverse: archive ⇄ unarchive (Archived list + Restore control on the screen), delete ⇄ undo (a row reversing the reversing row), snapshots editable/removable, and an **Undo action in every confirmation toast**. The inverse is always an appended op, never an erasure — `git revert`, not `git reset`. A soft delete the user can't undo is a bug, not a safety net.
5. **Local-first instant open** (spec §8.6): render from local cache immediately; NEVER block boot on network; sync is always background.
6. **Per-device Drive ledgers** (spec §8.4): each device writes only its own `ledger_<deviceId>.json`.
7. **`src/core/` boundary:** pure TS, no React/Next/Capacitor/drivestore imports (enforced by ESLint rule). Fully unit-testable in Node.
8. **UI obeys the LOCKED design language — spec §12 "Quiet Register" (see cheat-sheet below).** No palette/type/layout improvisation, no per-component drift. Every new screen matches it or you edit §12 by explicit decision first.

### 🎨 Design language — "Quiet Register" (LOCKED M2, canonical spec §12). READ §12 before any UI.
The thesis: **a paper ledger a designer fell in love with** — calm, exact, columnar; money is quiet by default with ONE iris spark + emerald-for-inflow. Reject the cold fintech dashboard AND the red/green spreadsheet. Restraint is the brand; the numbers are the hero.
- **Color (semantic tokens only, `globals.css`):** iris `--brand`/`--primary`/`--ring` (the one spark — use sparingly); emerald `--positive`/`text-positive` = money **in** only; rose `--destructive` = true-negative/danger only (expenses are **neutral** — the minus sign carries it); shadcn `neutral` base. Category identity = deterministic **color dots** via `categoryDotColor(id)` (`src/features/category-color.ts`) — the only swatch scheme.
- **Type (3 roles, `layout.tsx`):** **Fraunces** display (`font-display`) for hero figures/headings/wordmark, restraint only; **Geist** body; **Geist Mono** (`font-mono`) for **every amount**, always `.tnum`. Never mix these up.
- **Layout/patterns:** single reading column (`max-w-2xl`); soft `rounded-2xl` card surfaces; **balance hero** (big Fraunces figure + tiny uppercase eyebrow + quiet marginalia); **inline iris compose-bar** for create; **date-grouped register rows** (`[dot] [payee+category] … [mono amount] [hover ⋯]`); per-item actions behind a hover **`⋯` DropdownMenu**; **edit opens a right-hand `Sheet`** (NEVER a compose-area mode-swap — that was a real bug, do not reintroduce); confirm-destructive = `AlertDialog`.
- **Interaction/voice:** motion is a whisper (`transition-colors` + shadcn Sheet/menu/toast only; respect reduced-motion); feedback = `sonner` toasts bottom-right; soft rules (unusual sign) = **inline arm-then-confirm**, never `window.confirm`. Copy = sentence case, user-side voice, blameless specific errors, inviting empty states.
- **Extending:** shadcn/ui first; semantic tokens only; amounts `font-mono`+`.tnum`; headers Fraunces; create→compose-bar, edit→Sheet, actions→`⋯` menu. When in doubt, make it quieter. M11 polishes ON TOP of §12 (motion, empty/error, color-override UI) — never restarts it.

### Working style (user prefs — from global CLAUDE.md + memory)
- **Extremely concise; sacrifice grammar for concision.** No co-author mentions in commits. Prefer `gh` CLI for GitHub.
- **TDD is required:** plan → write failing tests (verify they fail) → write code → green.
- End each plan with a short list of unresolved questions (concise) if any.
- **Grilling pattern:** one question at a time in AskUserQuestion (never batch). (memory: `grilling-one-question-at-a-time`)
- Commit at milestone boundaries / coherent sub-slices; branch first if on default branch.

---

## Current Progress

**M0–M2 DONE + merged to `main`** (PR #1, `SomewhatMay/yaccount`). `main` now exists (based on an empty root commit `chore: init main`) and is the repo's **default branch**; the old `m0-scaffold` branch was rebased onto it, so M0–M2 commit SHAs changed.

**M3 (containers, transfers, balances) — DONE, PR'd, and MERGED to `main`** (PR #2, `SomewhatMay/yaccount`). The `m3-containers` branch listed as "not yet PR'd" in an earlier version of this doc has since been merged — see the git log below, current as of this session's start.

**M4 (time-variant budget targets) — DONE, merged to `main` via PR #3** (`c2f7804`). TDD followed: tests written first (confirmed red via missing modules), then implementation, then green. **234 vitest tests green (was 212 on `main`, +22 for M4); typecheck/lint/prettier/build clean.** No DB migration needed — `budget_targets` object store already existed since M1 (schema-only until now), so `DB_VERSION` stays 2. **User manually walked through the browser UI and confirmed it works** (set $300→$600 effective-date change, History list, "Current" badge, same-date clash-replaces warning, delete, refresh-persists) — the automated-suite-only caveat from earlier in this session no longer applies.

**M5 (Reporting & Dashboard Engine + Charts) — DONE, merged to `main` via PR #4.** TDD followed core-first (tests red via missing modules → impl → green). **234 → 266 tests** (+32; all in `src/core/engine`). Typecheck/lint/build/prettier clean. **User browser-verified the full dashboard** against a hand-computed fixture (all widgets, numbers correct). See "M5 decisions and delivered code" below.

**M6 (Recurring Rules, Templates & the Inbox) — DONE, merged to `main` via PR #5 (`0e9416e`).** Core-first: **266 → 312 tests** (+46). Typecheck/lint/build/prettier clean. **User browser-verified** all flows (incl. the three post-verify fix rounds + bulk dismiss below). **No DB/schema change** (`recurring_rules` + `goals` stores existed since M1, DB_VERSION stays 2). See "M6 decisions and delivered code" below.

**Execution order note:** the user chose to do **M3 before M8/M9** (impl §7 order says sync first) and then to keep going with product milestones rather than stopping for M8. M8 remains blocked on their Google Cloud setup. The impl doc's stated order was `…M3 → M4 → M6 → M5 → M7…`; the user swapped it to `…M4 → M5 → M6 → M7…` (did M5 before M6), then confirmed **M6 next after M5** when asked. **Both M5 and M6 are now done**, so the sequencing is moot going forward — **M7 is the only remaining feature milestone** and needs both (both merged). The lesson stands: **the user picks the next milestone explicitly — ask, don't assume** the impl doc's default order. (M8 auth stays blocked on the user's Google Cloud setup.)

Git log (`main`, current — M0–M6 merged):
```
0e9416e Merge pull request #5 from SomewhatMay/m6-recurring   (M6)
46e6f21 docs: note bulk dismiss
e288265 M6: bulk dismiss in the inbox (mirrors bulk approve; undo restores all)
9dd3d3c docs: note M6 post-verify fixes + test count 312
c593d47 M6 fixes from browser-verify feedback
9ec74b0 docs: M6 code-complete, handoff for browser-verify + M7
da944a5 M6: recurring rules, templates & the inbox
d5536ce docs: reconcile stale M4 PR status in handoff body
f9fccae Merge pull request #4 from SomewhatMay/m5-reporting   (M5)
36164fe docs: M5 browser-verified, merged via PR #4
c0b2a4e M5 UI: reporting dashboard + charts, period control, dashboard is home
… (M4 PR #3, M3 PR #2, M0–M2 PR #1 below — see prior handoff history)
```

### M6 decisions and delivered code (this session, branch `m6-recurring`)
- **No new object store, no `DB_VERSION` bump.** `recurring_rules` (and `goals`) already existed from M1 (schema-only until now). Templates are just `transactions` rows (`is_template=true`), so they need no store either.
- **Locked decisions made this session (with the user):**
  - **Cancelling a recurring rule is a SOFT, reversible action** (user's explicit pick over hard-delete): a new `status: active|cancelled` field on `recurring_rules` + paired ops `recurringRule.cancel`/`.uncancel` (share a reducer branch, op-type driven — same shape as category/container archive/unarchive). A "Paused" section on `/recurring` with a Resume control + an Undo toast satisfies §1.1's visible-inverse rule. **`status` is NOT in the spec §5.8 table** — it's a documented §1.1-reversibility extension (same class of deviation as the M3 `settings` store), defaults to `active` so pre-M6 fixtures still parse. Not a change to any locked decision.
- **`interval_config` tightened from M1's loose `z.record` to a frequency-DISCRIMINATED union** (impl §4/§10 obligation): `daily {}` · `weekly {day_of_week 0–6}` · `biweekly {days_of_month:[a,b]}` (twice-a-month anchors, ascending/distinct — NOT every-14-days, §5.8) · `monthly {day_of_month 1–31}` · `annually {month,day}` · `custom {every≥1, unit}`. Built as `z.discriminatedUnion("frequency", …)` over a shared `ruleBase`, plus two `.refine`s: fixed ⇒ `template_amount` set; a rule must be an expense/income (category) OR a transfer (destination). Existing `schemas.test.ts` fixtures still pass (status defaults).
- **Generation is pure + idempotent.** `engine/recurring.ts`:
  - `firstOccurrenceOnOrAfter(rule, from)` + `nextOccurrence(rule, date)` — occurrence math per frequency. Monthly/annually **anchor on the config day and clamp per-month** (Jan 31 → Feb 28 → recovers Mar 31; Feb 29 → Feb 28 non-leap) rather than chaining clamped dates. `next_generation_date` is only a **lower-bound cursor** — the engine snaps it onto the grid, so a start date that isn't itself an occurrence still generates right.
  - `generateDueOccurrences(rule, today)` → `{ rows, rule }` (advanced cursor). **Backfill by mode (§5.8 locked):** `fixed` = every missed occurrence oldest-first, each at its own due date; `goal_derived` = a SINGLE row dated today (M7 recomputes `required_monthly`; **amount stubbed to `template_amount`** for now, as impl §4 M6 says "goal_derived plumbing stubbed for M7"). **Occurrence row id is deterministic `${rule.id}:${dueDate}`** → regen never duplicates (idempotent `put`), even before the advanced cursor persists.
- **Ops added:** `template.create`/`.remove` (a template is a `transactions` row; `remove` is a hard delete — a shortcut is housekeeping, impl §3), `recurringRule.create`/`.update`/`.cancel`/`.uncancel`, `transaction.approve` (RMW pending→approved, idempotent). Generated occurrences persist via ordinary `transaction.create` (the row carries its own pending status + `recurring_rule_id`) — no new op type needed.
- **`activeRows` now also excludes `inbox_status='pending'`** — pending rows live in the Inbox only, never the register or any derivation (balances/reporting already excluded them via `isLiveLedgerRow`; this fixes the register display). New engine helpers `pendingRows` (the Inbox queue; a dismissed = voided occurrence drops out) and `templateRows`.
- **Commands:** `createTemplate`/`removeTemplate`/`logTemplate` (1-tap: template → real dated row, transfer-aware), `createRecurringRule`/`updateRecurringRule`/`cancelRecurringRule`/`uncancelRecurringRule`, `approveTransaction`, `recordGeneratedOccurrence`.
- **Core tests (+45, all `src/core`):** `model/recurringRule.test.ts` (union validation, cross-field refines, defaults), `engine/recurring.test.ts` (occurrence math per frequency incl. clamping, fixed backfill oldest-first, deterministic-id regen, end_date bound, goal_derived single-row, transfer generation, cancelled inert), M6 blocks in `oplog/apply.test.ts` (template create/remove, approve, cancel/uncancel lossless + table-driven idempotency extended to o18–o24), `engine/ledger.test.ts` (pending excluded, pendingRows/templateRows), `commands/commands.test.ts`.
- **UI** (`src/features/`, `"use client"`):
  - **`/inbox`** (`inbox/InboxView.tsx`) — pending queue with shadcn **`checkbox`** (added this session) for multi-select + a sticky selection bar with **bulk Approve AND bulk Dismiss** (commit `e288265`, mirrors approve; one shared `dismissMany` whose Undo un-dismisses the whole batch), per-row 1-tap Approve, `⋯` → Edit-before-approving (reuses `EditTransactionSheet` — `updateTransaction` keeps pending) / Dismiss (a void, Undo toast).
  - **`/recurring`** (`recurring/RecurringView.tsx` + `RecurringRuleSheet.tsx` + `describe.ts`) — active list (cadence summary via `describeRule`, next-date badge) + a **Paused section w/ Resume** (dashed card, §1.1). "New" opens a **frequency-aware Sheet** (create+edit): Expense/income ↔ Transfer toggle, category/container pickers, `SignToggle`, per-frequency config inputs, start/optional-end dates. UI only creates **`fixed`** rules (goal_derived is created by goals in M7).
  - **Templates on the ledger** — a **Shortcuts chip strip** above the compose bar (1-tap `quickLog`, hover ✕ to remove w/ Undo) + **"Save as shortcut"** in each ledger row's `⋯` menu (shape-preserving; Undo toast).
  - **Nav** (`AppNav.tsx`) — added **Inbox** (with a live **pending-count badge** via `pendingCountAtom`) + **Recurring** links.
  - **Store** — `recurringRulesAtom` (+ in `refreshAtom`), derived `templatesAtom`/`pendingCountAtom`, and **`runRecurringGenerationAtom`** run on bootstrap (after ready, §8.6 background) — generates due occurrences for active rules, dispatches create + cursor-advance ops.
- **Scope note / deferred to M7 (as specced):** `amount_mode='goal_derived'` amount is stubbed to `template_amount` (M7 wires `required_monthly` from the linked goal, §5.9.5); `linked_goal_id` is carried but nothing sets it yet (goals are M7). Nothing from the M6 spec scope was cut.
- **Post-first-verify fixes (user feedback, commit `c593d47`) — keep these:**
  1. **Editing a rule is forward-looking:** on edit the cursor is **reset to `firstOccurrenceOnOrAfter(editedRule, today)`**, not preserved from the old rule — preserving it could **mass-backfill** on a frequency increase if the old cursor sat in a past due-window. Already-generated pending/approved rows are left as independent proposals (the user edits/dismisses pending ones in the inbox); editing does not retro-rewrite them.
  2. **Generation runs immediately after create/edit** (`RecurringView` calls `runRecurringGenerationAtom` after the dispatch) — was **boot-only**, so a new rule's due/backfilled occurrences didn't hit the inbox until a refresh (bad on mobile).
  3. **`pendingRows` now uses the chain-walk liveness** (`liveIds` was parametrized with a reverser predicate; the Inbox passes "pending reversals count"). The old flat "is this id reversed by anything?" check meant **undoing a dismiss never restored the row** (the dismiss void still pointed at it). Dismiss → undo → redo now behaves like the ledger's void chain.

### M5 decisions and delivered code (this session, branch `m5-reporting`)
- **No new ops, no schema/DB change.** M5 is a pure derived-view layer over the existing tables — every number is computed on demand (spec §7: only the core tables persist; dashboards are re-derivable views). `DB_VERSION` stays 2.
- **Locked decisions made this session (with the user):**
  - **Preset windows = rolling from today** (user's explicit pick over calendar-aligned): `resolvePeriod` gives `today − N months … today` inclusive; YTD = Jan 1 … today; All = unbounded (`{start:null,end:null}`, bounds derived from data where a month count is needed).
  - **Two-range compare (§6.2) shipped**; **per-widget period override (§6.1) deferred to M11** (one global period drives all widgets).
  - **Dashboard is the home route** (`/`); the ledger moved to `/ledger`. A route-aware `AppShell` (`src/features/AppShell.tsx`) widens the dashboard to `max-w-5xl` (the one multi-metric screen §12.4 permits to widen); every other screen stays `max-w-2xl`. `AppNav` gained a Dashboard link.
  - **Chart category color reuses `categoryDotColor(id)`** (`src/features/category-color.ts`) — the §12.2 "one swatch scheme" rule; no separate chart palette. All other chart colors are **semantic tokens read as CSS vars** (`var(--positive)` income, `var(--muted-foreground)` expense-neutral, `var(--brand)` iris savings, `var(--destructive)` negative).
  - **Reconstructed-balance historical curve is built** (user said do everything) — the investment sparkline, not just the single gain/loss figure.
- **Core** (pure, unit-tested — `src/core/engine/`):
  - `period.ts` — `ReportingPeriod`/`DateRange` types, `resolvePeriod(period, today)` (today passed in → core stays clock-free), `inRange`, `monthKeysInRange(range, fallbackDates)`, `monthsInRange` (the monthly-average divisor = touched-month-key count, ≥1).
  - `reporting.ts` — `categoryBreakdown` + `categoryBreakdownMonthlyAverage` (signed-sum → magnitude, **genuine zero-filter** §6.4), `monthlyTotals` (income/expense/savings per month, transfers excluded), `categoryMonthlySpend` (vs. time-variant budget via `budgetOnDate`), `waterfallData`, `budgetComparison` (§6.3 re-scoped to active period), `totalExpenseBudgetOnDate` (monthly-bar overlay). **All run over `activeRows`** (void-aware) and exclude transfers (`category_id===null`).
  - `flows.ts` — `containerFlows` (net transfer in/out per non-archived container), `unrealizedGainLoss` (latest snapshot − `netContributions`), `reconstructedBalance` (nearest snapshot ± **two-directional** transfers in the gap, §10 #4 — rolls forward from a past snapshot or backward from a future one).
  - Exported via `engine/index.ts`. New tests: `period.test.ts` (16), `reporting.test.ts` (8), `flows.test.ts` (8) — hand-computed fixture (void pair nets out, refund nets within category, transfer excluded, budget resolved per-month).
- **UI** (`src/features/reports/`, all `"use client"`, **Recharts** — already an M0 dep):
  - `DashboardView.tsx` — orchestrator: reads atoms, resolves the primary + optional compare range against a session-stable `today`, renders one or two `ReportColumn`s (compare = `lg:grid-cols-2`). `ReportColumn` owns its own total/monthly-avg toggle + drill-down category selection and computes every aggregation with `useMemo`.
  - `PeriodPicker.tsx` — preset `Select` + custom native date inputs + a Compare toggle revealing a second `PeriodField`. No new shadcn components needed.
  - `chart-ui.tsx` — `CHART` token palette, `MoneyTooltip` (mono amounts, hides the waterfall's transparent `base` series), `monthLabel`/`formatAxisCents`, `Panel`/`EmptyNote`.
  - `widgets.tsx` — `CategoryDoughnut` (center total + legend w/ %), `MonthlyBarsChart` (ComposedChart bars + dashed budget line), `WaterfallChart` (stacked BarChart + transparent base, impl §10 #28 — no 2nd chart lib), `CategoryDrilldown` (category Select + spend bars vs. budget line), `ContainerFlowsTable`, `BudgetComparisonTable` (Δ% rose-over/emerald-under), `InvestmentCard` (gain/loss + reconstructed sparkline).
- **Store** (`src/features/store.ts`): `reportingPeriodAtom` (default `last-3-months`) + `comparePeriodAtom` (nullable). Hold only the period *descriptor*; `today` is supplied by the view (atoms stay clock-free). The §8.3 in-memory active-period cache is realized at the store layer (the full client dataset is already in memory); the IndexedDB-index fallback for cold historical periods stays a **later optimization, not built** (noted, low priority — everything is in-memory client-side today).
- **Scope note / what's intentionally NOT here:** per-widget period override (→ M11), category-color user override UI (→ M11), the IndexedDB-index cold-period fallback (optimization). Nothing from the M5 spec scope was cut.

### M4 decisions and delivered code (this session, branch `m4-budget-targets`)
- **No new op-type ceremony beyond what §5.3/impl §3 already specced.** `budget_targets` rows are unique per `(category_id, start_date)`; a single `budgetTarget.set` op **upserts by that natural key** (deletes any other row holding the key, same pattern as `snapshot.record`/`.update` from M3) — there's no separate `.update`, because set-onto-an-existing-date already IS the edit path (matches spec's "setting a budget for a date that already has a row upserts"). `budgetTarget.remove` is a **hard delete**, same rule of thumb as a superseded snapshot (impl §3: housekeeping, not a ledger amount) — the impl doc's op taxonomy already named this exact pairing, so this wasn't a new design decision, just the first milestone that needed it.
- **Core** (pure, unit-tested): `model/budgetTarget.ts` gained `makeBudgetTarget` (the `BudgetTargetSchema` itself already existed from M1). `oplog` — new op types `budgetTarget.set` / `budgetTarget.remove`; `apply.ts` gained `putBudgetTargetUpsert` (mirrors `putSnapshotUpsert`). `commands/` — `setBudgetTarget` (accepts an optional `id` so the same function creates a fresh row or edits an existing one in place — no separate update command needed, unlike snapshots which split `record`/`update` because snapshots don't upsert by natural key alone) and `removeBudgetTarget`. `engine/budgets.ts` — `budgetOnDate(rows, categoryId, date)`: the §5.3 resolution rule ("latest row with `start_date ≤ date`"), sorts internally so callers/device-merged data in arbitrary order still resolve correctly. New/extended tests: `model/budgetTarget.test.ts`, `engine/budgets.test.ts` (the worked example from spec/impl: Groceries $300 Jan → $600 Jun resolves correctly on both sides of the boundary, plus a one-off-elevated-month-then-reverts case), M4 blocks in `oplog/apply.test.ts` (upsert-by-natural-key, hard delete, replay convergence, added to the table-driven idempotency test) and `commands/commands.test.ts` — **212 → 234 tests**.
- **UI**: `features/categories/BudgetSheet.tsx` — a right-hand `Sheet` per category (same shape as `containers/LogBalanceSheet.tsx`'s "Reported balances": form to set a new effective-from amount + a **History list** with `⋯` → Edit/Delete, a "Current" badge on the row currently in effect, and an inline warning when the chosen date already has a row ("saving replaces it") — reusing the exact §12.4-a pattern (history list, not a write-only form) rather than inventing a new one. `CategoriesView.tsx` — each row now shows `$X/mo budget` marginalia (via `budgetOnDate`) under the name, and a new "Budget" (`TargetIcon`) entry in the `⋯` menu opens the sheet. `store.ts` — `budgetTargetsAtom`, included in `refreshAtom`. No new route; budgets live inside `/categories`, not a standalone page (nothing in spec/impl calls for one — budgets are a per-category property, and the reporting-period-scoped comparison view is explicitly M5, not M4).
- **Scope note:** M4 is resolution-engine-and-CRUD only, per impl §7's dependency graph ("M4 needs only M2, not containers") — the *comparison-to-budget* reporting view (spec §6.3, "Monthly Average" re-scoped to the active period) is explicitly M5 work (needs the unified reporting-period control from §6.1), not pulled forward here.

### M3 decisions (locked this session — do NOT reopen)
- **Default Spending Container is a SYNCED setting, not device-local.** New `settings` object store (key/value, `keyPath: 'key'`, **DB_VERSION → 2**) + a `setting.set` op (entity-LWW by `key`). Keys live in `SETTING` (`src/core/model/setting.ts`); today only `default_container_id`. Chosen over `app_meta` (never synced) and over a `containers` flag (would edit spec §5.2's table). This is an 8th synced store beyond the spec's seven tables — it is preferences, not ledger data.
- **IndexedDB upgrades are now guarded per store** (`db.objectStoreNames.contains`) so bumping `DB_VERSION` never drops a populated local cache (local-first §8.6). Do the same for every future store/index.
- **Transfers take a positive magnitude at the API edge.** `makeTransfer({amount})` requires a positive integer-cents magnitude and stores `-amount` on the source (§10 #5) — callers can't get the sign wrong. It throws on same-container, on non-positive amounts, and when neither `vendor_source` nor both container names are given.
- **A transfer is an ordinary `transaction.create` op** — the shape lives in the row's fields (`category_id: null`, `to_container_id` set), never a separate op type.
- **Ledger headline = Current Overall Balance** (§5.7 opt-in) instead of the general wallet's balance; this-month in/out excludes transfers (own-money moves are neither income nor expense).

### M3 delivered (code)
- **Core** (pure, unit-tested): `model/transaction.ts` — `makeTransfer` + `transferLabel`; `model/containerSnapshot.ts` — `makeContainerSnapshot`; `model/setting.ts` — `SettingSchema`/`SETTING`/`makeSetting`. `oplog` — new op types `snapshot.record` (snapshots accumulate, `put` by id) and `setting.set` (upsert by key). `repo/db.ts` — `STORE.settings`, `DB_VERSION = 2`, guarded upgrade. `commands/` — `createContainer`/`updateContainer`/`archiveContainer`, `createTransfer`, `recordSnapshot`, `setSetting`/`setDefaultContainer`. `engine/balances.ts` — `isTransfer`, `overallBalance(txns, containers)` (§5.7), `netContributions(txns, containerId)` (transfers only, approved-only per §10 #3). New/extended tests: `model/transfer.test.ts`, plus M3 blocks in `engine/balances.test.ts`, `commands/commands.test.ts`, `oplog/apply.test.ts` — **63 → 93 tests**.
- **UI**: `features/containers/ContainersView.tsx` (`/containers`) — rows with per-container balance (rose when negative), wallet/chart icon, `Default` badge, marginalia (counted · contributed · last reported), compose bar (name + plain/investment), hover `⋯` menu: Rename (inline) · Count in overall balance (toggle) · Make default wallet · Log reported balance (investment only) · Archive (AlertDialog; hidden for `general`). `features/containers/LogBalanceSheet.tsx` — snapshot Sheet (date + reported value). `ComposeBar` — `ToggleGroup` mode pills (Expense/income ↔ Transfer), container picker (follows the default until the user picks; `pickedContainerId ?? defaultContainerId`, **no effect-sync** — ESLint `react-hooks/set-state-in-effect` forbids setState in an effect), from→to pickers in transfer mode. `EditTransactionSheet` — transfer-aware (`TransferForm`: from/to + magnitude; keeps a user-written label, re-synthesizes an auto one). `LedgerView` — hero = overall balance, "N containers not counted" marginalia, transfer rows render `A → B` in muted mono. `store.ts` — `snapshotsAtom`, `settingsAtom`, derived `defaultContainerIdAtom` (falls back to `general`). New shadcn: `toggle`, `toggle-group`.
### M3 UI-refinement pass (user feedback after the first M3 build — keep these behaviors)
Five complaints, all fixed. The rules they establish apply to every future screen:
- **The sign is a VISIBLE control, not a hidden typing convention.** `features/ledger/SignToggle.tsx` — a `−`/`+` button beside every amount (muted for out, `text-positive` for in), defaulting to the category's direction. `amount.ts` grew `Sign`, `defaultSign(type)`, `splitSign(input)` and `resolveAmount(input, type, sign?)`; precedence = **explicit `sign` arg > typed `+`/`-` > category default**. A typed sign is *moved into* the control (`splitSign`) so typing `-10` on an expense is never a silent no-op — which was the user's actual complaint ("why can't I record a refund?"). Refund/rebate = one tap to `+`; the inline arm-then-confirm still fires on an unusual sign. Wired into `ComposeBar` and `EditTransactionSheet`; **new `src/features/ledger/amount.test.ts` (7 tests, 93 → 100)** — features/ code IS unit-testable when it's pure, so test it.
- **The compose-bar mode pill reads the chosen category's type** — "Expense" or "Income", not a static "Expense / income".
- **Toggle-state menu entries use `DropdownMenuCheckboxItem`**, never an always-on `CheckIcon` (that was "Count in overall balance"). Its indicator was also moved to the **leading** icon column with a reserved `size-4` slot, so it lines up with every other item's icon and the label doesn't shift on toggle.
- **shadcn `select.tsx` / `dropdown-menu.tsx` were edited (copy-in components — allowed):** dropdown content no longer clamps to `w-(--radix-dropdown-menu-trigger-width)` (that width came from the 32px `⋯` button — the cause of "claustrophobic" menus); both now `min-w-44/48`, `p-1.5`, `rounded-xl`, roomier items (`px-2.5 py-1.5`, `gap-2.5`), softer shadow. `SelectContent` default changed from `position="item-aligned"` to **`popper`** because shadcn disables animation for item-aligned (`data-[align-trigger=true]:animate-none`) — selects and menus now fade+zoom at `duration-150`, still whisper-level per §12.5.
- **Inline rename has explicit ✓/✗** (`features/RenameField.tsx`, shared by container + category rows). **Blur no longer commits** (buttons suppress it via `onMouseDown` preventDefault); Enter = save, Escape = cancel; an empty name cancels. Codified in **spec §12.4-a**.
- **Snapshots are correctable, and their history is visible.** The old write-only "Log reported balance" Sheet is now **"Reported balances"**: log a value + a **History list** of every report, each with `⋯` → Edit (loads it into the form, button becomes "Save changes") / Delete (AlertDialog). New ops **`snapshot.update`** (upsert) and **`snapshot.remove`** (the ONLY hard delete in `applyOp`) + commands `updateSnapshot`/`removeSnapshot`; 9 new tests (100 → 110) incl. order-independent replay convergence.
  - **One report per container per day (locked, spec §5.6):** `container_snapshots` is unique per `(container_id, date)` — the same natural-key upsert as `budget_targets`. `putSnapshotUpsert` in `applyOp` deletes any other row holding that key before writing, so logging/editing onto an occupied day **replaces** it and two devices converge (later op in the total order wins). The Sheet warns inline before you commit and the toast says "Report replaced".
  - **Why a hard delete is allowed here (user-blessed, do not reopen):** a snapshot is a *typed observation*, not a money movement — no balance/contribution/report derives from it — so it is housekeeping per impl §3's rule of thumb. The audit trail is untouched because **the removal is itself an op**: record → update → remove all live in the append-only journal and state is just their replay (the user's own framing: "ledger the delete and reconcile on load, like git"). Caveat to remember: after the §8.4 op-log collapse the deep history lives in archived `ledger_<deviceId>_YYYY-MM.json`, not the live local log.
- **Adversarial test audit (3 independent agents vs. the SPEC, not the code — 126 → 212 tests). Ten real bugs found and fixed; do not regress these:**
  - `parseDollars` stripped `$`/`,`/whitespace **globally**, so `"12.3 4"` silently became `$12.34` and `"1$2"` became `$12` — wrong money on disk. Now a single anchored regex (leading `$`, grouped commas only, no interior separators).
  - No safe-integer guard: `cents()`/`parseDollars` accepted values past 2^53, silently breaking the exact-`SUM` premise of integer cents. Now `Number.isSafeInteger` (also `zCents`/`zCentsNonNeg` are `.safe()`).
  - `zIsoDate` accepted non-calendar dates (`2026-13-45`, `2026-02-30`) → a `yearMonth` bucket (§8.3) no report can ever query. Now `isCalendarDate` in `primitives.ts`; `zYearMonth` bounds the month 01–12.
  - `TransactionSchema` let `yearMonth` disagree with `date` (a derived stored field). Now a `.refine`.
  - `makeVoidRow` would "void" a template (a template is not a ledger entry) → now throws.
  - `makeTransfer` accepted a whitespace-only `vendor_source` (defeating the NOT NULL intent) and threw on `""` even when both names were available → now trims and falls back to the synthesized label.
  - Names were never trimmed, so `"Groceries "` could shadow `"Groceries"` despite UNIQUE → `zName` (`z.string().trim().min(1)`) on categories + containers.
  - `nameTaken` didn't Unicode-normalize, so NFC `"Café"` and NFD `"Café"` both passed the uniqueness check → `.normalize("NFC")`.
  - `resolveAmount("--10")` resolved to −$10 (one sign stripped, the other eaten) → doubled signs now rejected; `splitSign` always returns a trimmed body.
  - `activeRows`/`liveIds` (a) let a **pending or template** reversal hide a row whose money the balance still counted (§10 #2), and (b) was **order-dependent on cyclic `reverses_id`** — two devices could disagree about what is on screen. Now only live reversals cancel, and cycle members are resolved first, deterministically, as hidden.
  - **`Repo.dispatch` had no rollback:** a throwing `applyOp` (op type from a newer client) left the op in the journal → log/state desync. Now `try/catch` → `tx.abort()`. **This was the most dangerous one.**
  - Also added: v1→v2 migration test with real data, deterministic-seed equality across two fresh DBs, "archived `general` is not resurrected on reopen", repo-level `ts` tie-break, a **table-driven idempotency test over every op type** (fails loudly when a new op is added without a proof), full-M3 shuffled-replay equality, out-of-order create/update/archive, unknown-op-type throws.
  - **Two findings are M9 design obligations, NOT M3 bugs — written up in spec §8.5 + impl §10 #33/#34:** (1) the reducer applies in arrival order with no per-row version, so a naive remote-delta merge could let an older op clobber a newer local edit — M9 must buffer-and-sort (preferred) or add `updated_ts`; (2) the snapshot `(container_id, date)` upsert deletes foreign rows, so a merge can destroy a report the deleting device never saw — consider deriving the row id from the natural key instead.
- **Reversibility pass (user pushback: "soft deleting means nothing if I can't undo it — undos are first-class"). This exposed a DOC gap, now fixed: spec **§1.1 Reversibility** is a new locked principle, §5.5 rewritten, §5.4 gained the undo-a-void rule, impl §0.3 rewritten.**
  - New ops `category.unarchive` / `container.unarchive` (reducer shares the archive branch, flag driven by op type; lossless — only `is_archived` flips).
  - `unvoidTransaction(voidRow)` = a row reversing the reversing row. Liveness is now a **chain walk**: `core/engine/ledger.ts` `activeRows`/`isVoided` (t1 → hidden after v1 → live again after u1 → hidden after v2). Balance needs no change; every reversal is a real signed amount. LedgerView uses `activeRows` instead of its old one-step filter.
  - UI: **Archived sections with Restore** on both Categories and Containers (dashed card, muted, container shows its balance), plus **Undo actions in the archive/delete toasts** (sonner `action`).
  - 11 new tests (115 → 126): `engine/ledger.test.ts` (delete → undo → redo, refunds stay visible), unarchive reducers incl. lossless round-trip + no-op when not archived, undo commands.
- **Pre-merge review fixes (3 of 4 the user picked; the 4th — a v1→v2 DB-upgrade test — was declined, still worth adding someday):**
  - **`is_investment` is toggleable after creation** (⋯ → "Track as an investment", checkbox item). It used to be fixed at create time, so a plain container could never gain reported-balance tracking.
  - **Archived containers stop counting toward the overall balance** (`overallBalance` skips `is_archived`; spec §5.7 formula updated) and the archive AlertDialog **names the live balance** when it isn't zero. Previously an archived container's money sat invisibly in the headline.
  - **Unique names enforced on rename, not just create** — `features/unique-name.ts` `nameTaken(items, name, selfId)` (case-insensitive, trimmed), wired into both containers and categories; `RenameField` gained a `validate` prop that blocks ✓ and shows the error inline. Category create now checks too.
- **Compose-bar pickers are pills** (`h-8 px-3 rounded-full min-w-32 max-w-44`) so container/category names aren't squished.

- **Deferred as specced:** Container Flows *view* stays M5 (needs the unified period control); Unrealized Gain/Loss + Reconstructed Balance stay M5.

### M2 decisions (locked this session — do NOT reopen)
- **Void = reversing row + `reverses_id`** (new nullable FK on `transactions`; spec §5.4 + impl §10 #24 updated): "delete" appends an opposite-sign row linking to the original; UI hides the voided pair, `balance = SUM` stays exact/auditable, and a void is distinguishable from a genuine refund (`reverses_id = null`). The original row is never mutated (append-only). Memory: `void-reverses-id`.
- **Jotai for cross-component UI state** (not React context) — client-only → Capacitor/static-export safe, keeps `src/core` pure (state lives in `src/features`). The `Repo` (IndexedDB handle) is a module-level singleton, not an atom. Context reserved for genuinely tree-scoped needs (theme provider). (impl §1 tech table.)
- **shadcn/ui as the component foundation** (Radix base, `radix-nova` style, `neutral`) + **Lucide** icons + **Tailwind v4** + **next-themes** (light/dark) + **sonner** toasts. **Policy: always use a shadcn/ui component first; hand-roll only when none exists. Prefer Lucide icons everywhere.** Components copied into `src/components/ui/` (`npx shadcn@latest add <name>`). Bespoke visual identity still deferred to **M11** — M2 uses clean shadcn defaults, not a design system. (spec §10.6, impl §1/§2 updated. Memory: `shadcn-ui-policy`.)

### M2 delivered (code)
- **Engine/`core`** (pure, unit-tested): `model/transaction.ts` — `makeTransaction` (derives `yearMonth`), `makeVoidRow`, `reverses_id` field. `oplog` — `transaction.create/update/void` types + reducers (all idempotent `put`; void's reversing row is keyed by its own id). `core/commands/` — pure Op builders (`create/update/archiveCategory`, `create/update/voidTransaction`; op `id`/`ts` injectable via `OpMeta` for deterministic tests). `core/engine/balances.ts` — `containerBalance` honoring the §0.4 identity (subtracts the `to_container_id` leg; excludes pending + template) from M2, though transfers' UI is M3. New test files: `model/transaction.test.ts`, `commands/commands.test.ts`, `engine/balances.test.ts` (63 total, up from 46).
- **UI** (`src/features` + `src/app`, client-only, **shadcn/ui-based**): `features/store.ts` — Jotai `categoriesAtom`/`containersAtom`/`transactionsAtom`/`readyAtom` + write atoms `dispatchAtom`/`refreshAtom`/`bootstrapAtom` (repo singleton via memoized `getRepo()`). `features/RepoBootstrap.tsx` — opens repo once, populates atoms (default global store; strict-mode-safe via the memoized promise). `features/AppNav.tsx` — nav (Lucide `WalletIcon`) + light/dark toggle (next-themes). `features/ledger/LedgerView.tsx` — balance `Card` (destructive color if negative), add/edit form on `Card`/`Input`/`Label`/`Select`/`Button`, ledger `Table`, unusual-sign confirm via `AlertDialog` (replaced `window.confirm`), `sonner` toasts, void-as-delete (hides the pair). `features/categories/CategoriesView.tsx` — `Card`/`Table` create/rename(inline `Input`)/archive with `Badge` type + Lucide action icons. `components/theme-provider.tsx` (next-themes) + `<Toaster/>` in `app/layout.tsx`. shadcn primitives in `src/components/ui/`; `cn` helper in `src/lib/utils.ts`. `/` = ledger, `/categories`.

### M2 design pass ("Quiet Register" — now the LOCKED design language, canonical in spec §12)
User asked for a modern/minimal/playful look (not the bland admin-CRUD first cut), then asked to codify it as law so future agents stay cohesive. **The authoritative spec is now tech-spec §12** (+ build map in impl §2 + cheat-sheet above). The below is just the M2 delivery record. M11 polishes on top of §12, never restarts it.
- **Tokens** (`globals.css`, appended block): retheme `--primary`/`--ring` to an **iris** brand spark (`oklch(0.54 0.2 280)` / dark `0.72 0.16 285`); add `--positive` (emerald) for money-in; negative balance uses `destructive` (rose). `text-positive`, `font-display`, `font-mono` utilities exposed via a 2nd `@theme inline` block.
- **Type (3 roles):** Fraunces (`--font-display`, `font-display`) for the balance hero/headings/wordmark; Geist body; **Geist Mono** (`--font-mono`) for amounts. `.tnum` = tabular-nums. Wired in `app/layout.tsx`.
- **Ledger redesign:** big **balance hero** (Fraunces) + this-month **in/out** marginalia (Lucide `ArrowDownLeft/UpRight`); a branded **compose bar** (borderless inline create); **date-grouped register** rows with **deterministic category color dots** (`features/category-color.ts` — presentational, foreshadows §10.1 M5) + `font-mono` amounts + a hover `···` **DropdownMenu** (Edit/Delete).
- **Edit UX fix (user's complaint):** editing no longer hijacks the compose card — **Edit opens a right-hand `Sheet`** (`EditTransactionSheet.tsx`) with Save + Delete. Unusual-sign confirm is now an **inline arm-then-confirm** (no `window.confirm`, no nested dialog); `features/ledger/amount.ts` `resolveAmount()` is the shared sign rule.
- **Categories redesign:** Fraunces header, branded compose bar, split **Expenses / Income** sections with color dots + hover `···` menu (Rename inline / Archive).
- **New shadcn components:** sheet, dropdown-menu, tooltip (+ existing set).

**Ops implemented so far:** `category.create/update/archive`, `container.create/update/archive` (M1), `transaction.create/update/void` (M2), `snapshot.record/update/remove` + `setting.set` (M3), `budgetTarget.set/remove` (M4), `template.create/remove` + `recurringRule.create/update/cancel/uncancel` + `transaction.approve` (M6). Plus the reversibility-pass additions `category.unarchive` / `container.unarchive` (M3). (Taxonomy extended per milestone — impl §3.) **Remaining for M7:** `goal.create/update/complete/cancel/archive`.

### M0 delivered
- `git init` (repo was not one); Next.js/Node `.gitignore`.
- **Next 16** (App Router), **React 19**, **TS strict**, `output:'export'` → static `out/` confirmed.
- Toolchain installed: **Tailwind v4**, ESLint (flat, `eslint-config-next`), Prettier, **Vitest 4**, `fake-indexeddb`, `idb`, `date-fns`, `zod 4`, `recharts`. (NOT drivestore — M9. NOT Capacitor — M10.)
- `src/core/` boundary + ESLint `no-restricted-imports` rule blocking React/Next/Capacitor/drivestore (verified firing on a probe).
- Scripts: `dev`/`build`/`test`/`lint`(=`eslint .`)/`typecheck`/`format`. Placeholder home page.

### M1 delivered (test-only, NO UI — 46 vitest tests pass)
All in `src/core/` (pure TS; only idb/zod deps):
- **`model/`** — zod schemas + inferred types for all **7 tables** (§5.1–5.9.2): `category`, `container`, `budgetTarget`, `transaction`, `containerSnapshot`, `recurringRule`, `goal` + `primitives.ts` (`newId`, `Cents` alias, `yearMonthOf`, zod helpers `zId/zIsoDate/zYearMonth/zCents/zCentsNonNeg`). Factories: `makeCategory`, `makeContainer`, `makeGeneralContainer`. `GENERAL_CONTAINER_ID = "general"`.
- **`money.ts`** — `parseDollars` (string-based, rounds half-up on 3rd decimal, no float drift), `formatCents` (explicit leading minus per §5.4, `$` + thousands via Intl), `cents/addCents/subCents/negateCents/sumCents`.
- **`oplog/`** — discriminated `Op` union (`OpBase & {type, payload}`), `Tx` accessor interface + `MemoryTx` (in-memory Map-backed) + `newMemoryState`, `applyOp` reducers, `compareOps` (total order `ts` then `id`), `replay` (sorts then applies).
- **`repo/db.ts`** — IndexedDB schema: 9 stores (`STORE` registry), transaction indexes `by_container_category_month` + `by_container_month`, oplog index `by_ts`. `STATE_STORES`/`ALL_STORES`/`INDEX` exports. `openDb(name?)`.
- **`repo/repo.ts`** — `Repo` class: `open()`, `dispatch(op)` (append+apply in ONE tx, idempotent by op.id), `get/getAll`, `getDeviceId`, `listOps` (total order), `close`. `IdbTx` (idb-backed `Tx`). First-init: seeds `'general'` as a **deterministic idempotent op** (`id:"seed:general"`, epoch ts → converges across fresh devices, sorts first); mints device-local `deviceId` into `app_meta` (NEVER an op).

**Ops after M1:** `category.create/update/archive`, `container.create/update/archive`. (Current full list is under M2 delivered above.)

---

## What Worked

- **Manual Next.js scaffold** (not `create-next-app`) — dir already had the two design docs; manual setup gave clean control over the `src/core/` boundary.
- **Entity-level LWW design:** `create`/`update` ops carry the FULL row and reduce via `put` → naturally idempotent; `archive` is read-modify-write. Matches the §8.5 conflict policy and makes replay idempotent for free.
- **Same `applyOp` reducer over two `Tx` impls** (`MemoryTx` for pure tests/replay, `IdbTx` for the real single transaction) — lets all logic be tested in Node without IndexedDB, and guarantees replay == incremental.
- **`'general'` seeded as an op with a deterministic id + epoch ts** — two fresh devices converge on one wallet instead of minting duplicates; idempotent on re-open.
- **String-based money parsing** — avoids float drift (`1.005` → `101` via integer/string math, not `*100`).
- **Red→green TDD** — wrote all 4 test files first, confirmed red (missing modules), then implemented to green.
- **(M2) Void as a `put` of a reversing row** — `transaction.create/update/void` all reduce to the same `put`; the distinction is intent (`reverses_id`), not reducer branch. Idempotent for free, no destructive path, and "is X voided?" is a derived query (`∃ row.reverses_id === X.id`), so nothing mutates the original.
- **(M2) `reverses_id` on the reversing row only** — lets the UI hide voided pairs while keeping both rows in the ledger (balance exact), and cleanly separates a void from a real refund. User-blessed via a single grilling question before coding.
- **(M2) Jotai atoms + write-atoms for the data seam** — `dispatchAtom`/`refreshAtom`/`bootstrapAtom` keep components boilerplate-free (`useAtomValue`/`useSetAtom`) and the `core` op-log path untouched. Repo as a memoized-promise singleton survives React strict-mode double-effect without opening two DBs.
- **(M2) `containerBalance` honors the full §0.4 identity now** — subtracts the `to_container_id` leg + excludes pending/template even though transfers arrive in M3, so M3 needs zero balance-engine rework. Tested with a synthetic transfer row.
- **(M2) `OpMeta` (injectable op `id`/`ts`) on commands** — pure Op builders stay deterministic in tests while defaulting to `newId()`/`now` in the app.
- **(M2) shadcn/ui drop-in** — `npx shadcn@latest init -t next -b radix -p nova -y --no-monorepo` cleanly detected Next 16 + Tailwind v4 + the `@/*` alias; `add` pulls Radix + deps. Copy-in components in `src/components/ui/` don't touch the `src/core` boundary. Replaced the hand-rolled controls (raw `<input>`/`<select>`/`window.confirm`) with `Input`/`Select`/`AlertDialog`, `Table`, `Card`, `Badge`, `sonner` toasts, next-themes light/dark. Icons = Lucide.

## What Didn't Work (don't repeat)

- **WSL PATH interop leaks Windows `node.exe`/`npm`.** (memory: `wsl-npm-use-wsl-node`) First `npm install` ran under Windows npm (`/mnt/c/Program Files/nodejs/npm`), producing `.bin` shims with no exec bit → `next: Permission denied`; a postinstall hit `Cannot find module 'C:\Windows\postinstall.js'`. **FIX (do this for EVERY npm/npx call):** prefix with `export PATH="/home/may/.nvm/versions/node/v22.18.0/bin:$PATH"`. If an install ever ran under Windows npm, wipe `node_modules` + `package-lock.json` and reinstall with WSL npm.
- **`next lint` removed in Next 16** — `lint` script uses `eslint .` directly; the `eslint` key in `next.config.ts` is invalid (removed).
- **`FlatCompat` + `eslint-config-next` failed** on ESLint 9 / Next 16 (circular JSON validation). eslint-config-next 16 exports a **native flat-config array** — `import next from "eslint-config-next"; export default [...next, ...]`. No FlatCompat, no `@eslint/eslintrc`.
- **`negateCents(0)` returned `-0`** (test caught via `Object.is`) — normalized to `return a === 0 ? 0 : -a`. Watch for `-0` in future cents math/display. (M2 `makeVoidRow` guards the same way.)
- **(M2) Adding a REQUIRED field to a zod table schema breaks existing test fixtures** — `reverses_id` (nullable but not `.optional()`) failed the pre-existing `schemas.test.ts` `TransactionSchema` fixture until `reverses_id: null` was added. When you extend a table, grep every literal fixture for that shape and add the key.
- **(M2) `crypto.randomUUID()` / IndexedDB are browser-only** — the UI can't be unit-tested here (Playwright is M11). Automated coverage stops at the pure `core`; UI is a manual browser check (the milestone's own How-to-test). `next build` prerenders client components to their pre-hydration state ("Loading…"), which is a useful smoke signal but NOT a runtime-interaction test.
- **(M2) `shadcn init` still prompts for a style preset even with `-y`** — must pass `-p nova` (or another preset) or it hangs on a non-TTY. Also chose `-b radix` (canonical shadcn/ui) over the newer default `base` library. `sonner` pulls in `next-themes` (its `<Toaster>` uses `useTheme`) — wrap the app in a next-themes `ThemeProvider` (done in `layout.tsx`, with `suppressHydrationWarning` on `<html>`). `next/font/google` (Geist) fetches at build → build needs network once.

---

## Next Steps

**M6 is DONE and merged to `main` (PR #5, `0e9416e`), browser-verified.** No open actions. `main` now has M0–M6.

### Up next: **M7 — Savings Goals & the Monthly Allocation Plan** (CONFIRM with the user first)
**This is the LAST feature milestone** — completing it means v1 is feature-complete (and, since sync M9 is deferred/blocked on Google Cloud, v1-shippable once M8/M9 land). **M7 needs BOTH M5 and M6** (impl §7 dependency graph) — both now done. But the user re-orders and picks the next milestone explicitly — **ask, don't assume.** (M8 auth stays blocked on the user's Google Cloud setup, unchanged.)

**M7 scope (impl §4 "M7" + spec §5.9/§6.8, read in full before coding):** `goals` table CRUD (kind spend_down/reserve, mode deadline/fixed/passive, ≤1 active per container app-level, auto-create-or-reuse container on name collision); the derivation engine (`contributed`/`progress`/`required_monthly` per mode+kind, the §5.9 worked examples become tests); **goal-derived recurring contributions** — this is where M6's `amount_mode='goal_derived'` gets its real `required_monthly` computation + `linked_goal_id` wiring (currently stubbed to `template_amount`); lifecycle (complete/oscillate/cancel-never-moves-money/leftover-absorb); and the **Monthly Allocation Plan** view. New ops: `goal.create/update/complete/cancel/archive`. **Tighten the goal cross-field zod refinements** (M1 left them for M7 — see `model/goal.ts` NOTE).

**Deferred niceties surfaced during M5 (not blockers):**
- **Period atoms aren't persisted** — `reportingPeriodAtom`/`comparePeriodAtom` reset on refresh. Fine for now; if wanted, persist to the synced `settings` store or localStorage (localStorage is device-local, which is arguably correct for a view preference). M11 polish candidate.
- **Cold-period IndexedDB fallback (§8.3)** not built — all aggregation runs over the full in-memory transaction set (fine at current scale; the `by_container_month`/`by_container_category_month` indexes exist for when it matters).
- **Per-widget period override (§6.1)** and **category-color user-override UI (§10.1/§5.1)** both deferred to M11 as speced.

**Milestone-ownership deferrals to remember (flagged in M1, NOT open decisions):**
- Recurring `frequency↔interval_config` + `amount_mode↔template_amount` refinements — ✔ **DONE in M6** (`interval_config` is now a frequency-discriminated union; two `.refine`s cover amount_mode + shape). **Still open: goal `mode`/`kind` invariants → M7** (`model/goal.ts` NOTE marks the spot).

**Deferred platform work (do NOT touch until their milestone):**
- **M8** (Google OAuth) — blocked on the user creating the Google Cloud project + OAuth consent screen + Web SPA client ID; ask before assuming they want to switch to it.
- **M9** (Drive sync) / **M10** (Capacitor native): after M8. The impl §6 parallel non-code track (Google Cloud project, the three OAuth client IDs, privacy policy) is the **user's** to do; it gates M8–M10, not local product work.

---

## Verify commands

**On native Windows (this session's environment, `E:\GitHub\yaccount`):**
```bash
node -v           # must be >=20.19 or >=22.12 — vitest 4/rolldown/vite 8 refuse to start below that
npm test          # vitest — 312 passing at M6
npm run typecheck # tsc --noEmit
npm run lint      # eslint .
npm run build     # next build → static out/
npx prettier --check .   # NOTE: flags nearly every file with CRLF warnings if `git config core.autocrlf=true` —
                          # that's a working-tree checkout artifact, not real drift; git still stores LF.
                          # Only worry about files you actually touched.
npm run dev       # serves http://localhost:3000 (or next free port)
```
This machine's global Node was v20.10.0 (too old) at session start; upgraded to **v24.18.0 LTS via `winget install --id OpenJS.NodeJS.LTS`** (needed a UAC prompt the user had to click through). If `npm test` fails with `Cannot find native binding` / `@rolldown/binding-*` after a Node upgrade, that's the documented npm optional-deps bug (github.com/npm/cli/issues/4828) — fix with `rm -rf node_modules package-lock.json && npm install` (this regenerates the lockfile; expect small patch-version churn, not a real problem).

**On WSL (an earlier session's environment, `/home/may/github/yaccount` — may or may not still be in use):**
```bash
export PATH="/home/may/.nvm/versions/node/v22.18.0/bin:$PATH"
cd /home/may/github/yaccount
npm test && npm run typecheck && npm run lint && npm run build && npx prettier --check . && npm run dev
```

## Key facts / gotchas
- **Two environments have now been used for this repo** — WSL2 (`/home/may/github/yaccount`, Node v22.18.0 via nvm) in earlier sessions, native Windows (`E:\GitHub\yaccount`, Node v24.18.0) this session. Check which one you're actually in (`pwd`, `uname -a` vs `echo $OS`) before trusting path-specific notes below.
- `crypto.randomUUID()` for all ids — needs secure context in browser (HTTPS/localhost); fine in Node/Vitest and Capacitor WebView.
- zod v4 API: `z.record(z.string(), z.unknown())` needs the key schema; `z.number().int().min(0)` for nonneg.
- `tsconfig.json` has `verbatimModuleSyntax: true` → use `import type` for type-only imports.
- Next auto-managed `tsconfig` to `jsx: "react-jsx"` and added `.next/dev/types` to include — leave as-is.
- Memory files live at `~/.claude/projects/<project-slug>/memory/` (MEMORY.md index) — the slug is derived from the working-directory path, so it differs between the WSL and Windows environments (they do NOT share memory automatically). Relevant memory topics from earlier sessions: `wsl-npm-use-wsl-node`, `grilling-one-question-at-a-time`, `void-reverses-id`, `shadcn-ui-policy` — re-save these on a new environment's memory store if they're missing there.
- **State management = Jotai** (added M2, `src/features/store.ts`). Cross-component UI state → atoms; `src/core` stays React-free. Add new persisted-data atoms there and refresh them in `refreshAtom`.
- **UI = shadcn/ui first** (added M2). Reach for a shadcn component before hand-rolling; add via `npx shadcn@latest add <name>` (WSL: PATH export first). Radix base, `neutral` theme in `globals.css`, `cn` from `@/lib/utils`. **Icons = Lucide** (`lucide-react`). Toasts = `sonner` (`import { toast } from "sonner"`; `<Toaster/>` in layout). Theme = next-themes (`ThemeProvider`, light/dark). Memory: `shadcn-ui-policy`. Present shadcn components: button, input, label, select, card, table, badge, separator, alert-dialog, sonner, sheet, dropdown-menu, tooltip.
- **Spec §12.4-a (added M3) covers editing patterns:** inline rename = ✓/✗ never blur-commit; loggable-repeatedly records get a **history list** with `⋯` Edit/Delete, never a write-only form; money direction = visible `SignToggle`; toggle menu entries = checkbox item with a **leading** indicator. shadcn `select`/`dropdown-menu` were edited in-repo (copy-in components) for width/padding/animation — selects are `position="popper"` so they animate.
- **Design language = "Quiet Register", LOCKED — spec §12 is law** (impl §2 build map; HANDOFF cheat-sheet in invariant #8). Fonts Fraunces/Geist/Geist Mono; iris brand + emerald-positive tokens; compose-bar/Sheet/register-row/`⋯`-menu patterns; `categoryDotColor(id)` swatches. Read §12 before building any UI; do not drift. Memory: `quiet-register-design-language`.
- **`src/features/` = React/UI** (Jotai, components); **`src/core/` = pure TS** (model/oplog/repo/commands/engine). Keep the boundary — ESLint blocks `core` importing React/Next/Capacitor/drivestore.
- **`HANDOFF.md` is gitignored** (local-only working doc) — update it on disk each milestone; it is not committed and won't be in a fresh clone.
- UI can't be auto-tested until Playwright (M11); `next build` prerendering to "Loading…" is only a smoke check, not runtime verification.
