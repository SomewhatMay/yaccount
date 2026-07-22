# M11 — Design System & Polish ("The Standing Register")

## Context

yaccount is feature-complete through M9 (M10 Capacitor skipped by user choice). 407 vitest tests
green, all UI verified manually in a browser. The remaining milestone is M11: the finishing pass on
top of the LOCKED §12 "Quiet Register" design language.

Five problems drive this pass:

1. **Ledger ordering is wrong.** `transactions.date` is `YYYY-MM-DD` only (`src/core/model/transaction.ts`).
   `LedgerView.tsx:122` breaks same-day ties on `id` — a random UUID — so entries logged today appear
   in arbitrary order and the newest entry does not surface.
2. **The app is desktop-centred and awkward.** `AppNav.tsx` is a wrap-flex row of 8 links; there is no
   thumb-reachable primary action; the shortcut chip strip crowds the ledger; no list view has filters.
3. **Identity is timid.** M2 shipped clean shadcn `neutral` + a 4%-opacity iris wash. The user wants
   real boldness and character.
4. **Dashboard is thin** vs. the category baseline (YNAB / Monarch / Copilot): no KPI deltas, no
   cash-flow Sankey, no spending calendar, no budget pace, no top payees, no upcoming commitments.
5. **Errors are invisible.** No error boundary anywhere; `dispatchAtom` (`store.ts:121`) has no
   try/catch so a failed write is a silent unhandled rejection; the only logging is one `console.error`
   in `syncAtom`.

**Design direction (approved): A — "The Standing Register".** Extend §12, never restart it. Same
thesis, same three typefaces, same iris/emerald semantics. Three new moves:
- **Paper & ink tinted with the brand hue** — the neutral field carries a trace of iris (h≈285) so it
  stops reading as default shadcn grey. Iris itself moves from 4% washes everywhere to **full strength,
  used rarely**.
- **The figure standing on its own history** — the hero balance sits on a faint area curve of the
  trailing 90-day overall balance. Extends §12.7 signature #1.
- **The carried balance** — sticky day headers in the register print the running overall balance as of
  that day, like a paper check register. New structural device; information, not decoration.
Plus **the rule** (hairline only above a total) and **Fraunces italic marginalia**.

This is a deliberate, documented edit to spec §12, per invariant #8 — not silent drift.

---

## Non-negotiables carried in

- Op-log write path; money = integer cents; balance identity (§0.4); never a one-way action (§1.1).
- `src/core/` stays pure TS (ESLint-enforced). All new derivations are pure engine functions.
- TDD: failing tests first, confirmed red, then implementation.
- shadcn/ui first; semantic tokens only; amounts `font-mono` + `.tnum`; headers Fraunces.
- WSL: prefix every npm/npx call with `export PATH="/home/may/.nvm/versions/node/v22.18.0/bin:$PATH"`.

---

## Execution protocol

**One phase at a time.** Each phase is independently browser-testable, ends in its own commit, and
stops for the user to verify before the next begins. Pure-engine work is folded into the phase that
consumes it — an engine-only commit cannot be tested in a browser.

| # | Phase | User tests by |
|---|---|---|
| 1 | Entry timestamps + ledger ordering | Logging 3 entries in a row; newest on top, survives refresh; old data intact |
| 2 | Logging, error boundaries, diagnostics | Forcing an error; toast + boundary + Copy diagnostics |
| 3 | Design system v2 (tokens/type/motion) + spec §12 edit | Every screen re-skins, light/dark, reduced-motion |
| 4 | Mobile shell (tab bar, sidebar, FAB, quick-add, ⌘K, Settings) | Device toolbar at 390×844; log from any screen |
| 5 | Ledger v2 (history curve, carried balance, filters/sort) | Hero curve, sticky day totals, filtering |
| 6 | Filters + mobile density on the other 5 list views | Each tab filters; no table overflow on mobile |
| 7 | Dashboard v2 (KPIs, pace, Sankey, calendar, payees, upcoming) | All widgets; per-widget period; persists |
| 8 | Category colours, empty/loading/error states, a11y | Set a colour; empty states; keyboard nav |
| 9 | Playwright e2e | `npx playwright test` |
| 10 | Docs (spec §12, impl §4, HANDOFF) | Read |

### Phase 1 — corrections to the slice below, made after reading the code

- **No `DB_VERSION` bump.** IndexedDB records are schemaless; a new nullable field needs no upgrade.
  A bump would trip `blocked()` in other tabs and lock out older builds for no benefit. The backfill
  runs once in `Repo.init()` guarded by an `app_meta` marker — idempotent, retried on next open if it
  ever fails.
- **`entered_at` is a required key** (`zIsoDateTime.nullable()`), matching this repo's explicit stance
  in `schemas.test.ts:317` ("nullable fields are required keys"). Only one literal fixture breaks
  (`schemas.test.ts:131`); everything else is built through the model factories.
- **Also fixing the adjacent UTC-date bug.** `today()` / `thisMonth()` in `LedgerView.tsx:48-49`,
  `ComposeBar.tsx:28` and `store.ts` use `new Date().toISOString()`, which is **UTC** — after ~7pm in
  UTC-5 a new entry is dated tomorrow and lands under the wrong day header. Same defect family as the
  ordering bug; leaving it would make the ordering fix look broken near midnight. New
  `src/features/clock.ts` (`todayIso`, `thisMonthIso`) using local time; `src/core` stays clock-free.

## Work plan — one commit per slice

### 1. `fix: order the ledger by full entry timestamps`

Root cause: rows carry a calendar date but no wall-clock instant. Fix = add the instant, keep `date`
as the user-controlled calendar date (changing `date` to a datetime would break `yearMonthOf`,
`budgetOnDate`, `inRange`, occurrence math, and has no sane value for a backdated row).

- `src/core/model/transaction.ts` — add `entered_at: z.string().nullable()` (ISO 8601 datetime).
  Threaded through `makeTransaction` / `makeTransfer` / `makeTemplate`; `makeVoidRow` **overrides** it
  (a void is a new event, not the original's instant).
- `src/core/commands/index.ts` — the existing `meta()` helper already mints an ISO `ts`. Stamp
  `entered_at` from that same value, so it is deterministic under `OpMeta` injection in tests and
  always agrees with the journal.
- `src/core/oplog/apply.ts` — in the `transaction.create` / `.void` / `template.create` branches,
  fill `entered_at` from `op.ts` when the row lacks it. Keeps `state == replay(listOps())` exactly
  (deterministic in `op`) and gives correct ordering for rows synced from an older client.
- `src/core/repo/db.ts` — `DB_VERSION` 3 → 4. Guarded upgrade backfills existing rows by scanning the
  `oplog` store inside the same `versionchange` transaction and stamping `entered_at = op.ts` from each
  row's earliest create op. No data drop (same guarded pattern as v2 → v3).
- `src/core/engine/ledger.ts` — new pure `sortForRegister(rows)`: `date` desc, `entered_at` desc
  (null last within the day), `id` desc.
- `LedgerView.tsx` uses it; row meta shows the time for Today/Yesterday groups;
  `EditTransactionSheet.tsx` shows "Entered <date, time>" as marginalia.

Tests: model round-trip incl. null default; command stamping under injected `ts`; `applyOp` backfill
+ idempotency (extend the table-driven test); `sortForRegister` ordering incl. null mix; a v3→v4
migration test with real data over `fake-indexeddb`.

### 2. `feat: derivation engine for the register rail and dashboard v2`

All pure, all in `src/core/engine/`, all TDD against hand-computed fixtures.

- `balances.ts` — `overallBalanceAsOf(txns, containers, iso)` and `overallBalanceSeries(txns,
  containers, days[])` (single ordered pass). Reuses the existing §5.7 counted-container rule in
  `overallBalance`. Feeds both the hero curve and the carried day-header balance.
- `reporting.ts` — `periodSummary(range)` + `comparePeriodSummary(a,b)` (in/out/saved/rate + Δ%),
  `dailySpend(range)` (calendar heatmap), `topPayees(range, limit)` (groups `vendor_source`),
  `largestTransactions(range, limit)`, `savingsRateSeries(monthly)`, `categoryTrendSeries` (per-row
  sparklines), `sankeyFlows(range)` → `{nodes, links}` for recharts' `Sankey` (already in recharts
  3.10 — no new dependency).
- `budgets.ts` — `budgetPace(txns, categories, targets, yearMonth, today)` → `{spent, budget,
  monthElapsedPct, spentPct, projected, onPace}`.
- `recurring.ts` — `upcomingOccurrences(rules, from, to)` over the existing `nextOccurrence` grid.
- `filter.ts` (new) — `TransactionFilter` type + pure `matchesFilter` / `applyFilter` (text, category
  ids, container ids, kind expense|income|transfer, date range, amount range) so every list view and
  its tests share one predicate.

### 3. `feat: structured logging, error boundaries and a diagnostics panel`

- Deps: `loglevel` (levels + named loggers), `react-error-boundary`.
- `src/lib/log-buffer.ts` — pure ring buffer (last 300 records) + redaction of tokens/emails/ids.
  Unit-tested.
- `src/lib/logger.ts` — `log = createLogger("ledger" | "sync" | "repo" | …)`, level persisted to
  localStorage, writes to console + ring buffer, `captureError(err, context)`, `getDiagnostics()`.
- `src/app/error.tsx` + `src/app/global-error.tsx` — Next route-segment boundaries, in §12 voice
  ("Something broke on this screen. Your data is safe on this device."), with Retry + Copy details.
- `src/features/ErrorBoundary.tsx` — wrapper over `react-error-boundary` with `resetKeys`, used per
  dashboard widget so one bad chart can't take down the screen.
- `RepoBootstrap.tsx` — install `window.onerror` + `unhandledrejection` handlers → logger + toast.
- `store.ts` — wrap `dispatchAtom`, `syncAtom`, `runRecurringGenerationAtom`,
  `runGoalMaintenanceAtom`, `bootstrapAtom` in try/catch → log + a blameless toast. This closes a real
  bug class: every `await dispatch(...)` call site today is unguarded.
- `src/features/settings/DiagnosticsPanel.tsx` — app/DB version, deviceId, op counts, last sync +
  `lastSyncErrorAtom`, the log buffer, and **Copy diagnostics**.

### 4. `feat: design system v2 — tinted paper, figure scale, motion tokens`

- `src/app/globals.css` — retheme every semantic token to the tinted paper/ink ramp (light + dark) per
  the table in the approved direction; add `--rule`, `--surface-sunken`, motion tokens
  (`--ease-register`, `--dur-1/2/3`); add `.figure-hero` / `.figure-lg` / `.figure-md` (Fraunces,
  fluid `clamp()`, optical sizing, tight tracking, tnum), `.marginalia` (Fraunces italic), `.eyebrow`,
  `.rule`, `.leaders` (dot leaders). Global `prefers-reduced-motion` kill-switch.
- `src/app/layout.tsx` — Fraunces gains `style: ["normal","italic"]` and the `SOFT`/`WONK`/`opsz`
  variable axes (fall back to plain if the build rejects the axes).
- `src/features/ui/` (new shared primitives): `Figure` (hero amount + optional history curve),
  `Money` (mono/tnum/sign-aware), `Eyebrow`, `Marginalia`, `RuledTotal`, `LeaderRow`, `Sparkline`,
  `ResponsiveSheet` (bottom on mobile, right on `sm+`), `EmptyState`, `ListSkeleton`.
- **Edit spec §12 in place**: extend §12.2 (token ramp), §12.3 (figure scale + italic marginalia role),
  §12.4 (the rule, leaders, sticky carried header, responsive density), §12.5 (motion budget: the
  single orchestrated quick-add sequence), §12.7 (signatures restated). Mirror in impl §4 M11.

### 5. `feat: mobile shell — bottom tab bar, sidebar rail, quick-add FAB`

- shadcn adds: `popover`, `command`, `skeleton`, `tabs`, `switch`, `collapsible`, `scroll-area`.
- `AppShell.tsx` — `< lg`: compact top bar (wordmark + sync + theme) + **bottom tab bar**
  (Home · Ledger · Plan · More, badge on More) + safe-area padding. `≥ lg`: **slim left sidebar rail**
  with all 8 destinations + Settings; content stays a centred reading column (`max-w-2xl`, dashboard
  `max-w-5xl`).
- `src/features/shell/QuickAddFab.tsx` — iris FAB bottom-right, floating above the tab bar, present on
  every screen. Opens `QuickAddSheet`.
- `src/features/shell/QuickAddSheet.tsx` — **shortcuts strip moves here from the ledger** (the
  declutter), then Expense/Income/Transfer tabs over the existing `ComposeBar` field logic (extracted
  so bar and sheet share one implementation and one `resolveAmount` rule).
- `src/features/shell/MoreSheet.tsx` — remaining destinations + settings, bottom sheet (no dead-end route).
- `src/features/shell/CommandPalette.tsx` — ⌘K / Ctrl-K: jump to any screen, run quick actions, search
  transactions. Desktop power, zero mobile cost.
- `src/app/settings/page.tsx` — appearance, account/sync, category colours, diagnostics.

### 6. `feat: ledger v2 — balance on its own history, carried day totals, filters`

- Hero: `Figure` with the 90-day `overallBalanceSeries` curve as its ground; in/out marginalia.
- Register: sticky day header printing the day's carried balance with dot leaders. **Hidden while a
  filter is active** — a filtered list's rows no longer explain the balance, and a number you can't
  reconcile is worse than no number.
- `src/features/FilterBar.tsx` — search field + horizontally-scrolling chip filters (Popover +
  checkbox multi-select) + sort control + active count + Clear. Filters are **not** persisted (a hidden
  active filter is a trap); sort preference is.
- Ledger filters: text, category, wallet, type, date range, amount range. Sort: newest / oldest /
  largest / smallest.
- Row press states, `active:` scale on touch, iris wash on a just-logged row.

### 7. `feat: filters and mobile density for every list view`

Same `FilterBar` across `InboxView` (rule, wallet, category, date), `GoalsView` (status, kind),
`RecurringView` (status, frequency, type), `ContainersView` (type, counted, archived),
`CategoriesView` (type, has-budget, archived). Every `Table` gets a card-list layout below `sm`.

### 8. `feat: dashboard v2 — KPI deltas, pace, Sankey, calendar, payees, upcoming`

- KPI strip (in / out / savings rate / balance, each with Δ vs. the previous equivalent period).
- Budget pace bar for the current month; cash-flow **Sankey**; **spending calendar heatmap**; top
  payees; largest transactions; upcoming commitments (30 days); active-goals rail; per-category
  sparklines in the breakdown list.
- **Per-widget period override** (§6.1, deferred here) and **period persistence** to localStorage
  (`reportingPeriodAtom` / `comparePeriodAtom` reset on refresh today).
- Responsive: single feed on mobile, 2-col grid on `lg`. Every widget wrapped in `ErrorBoundary`.
- Charts follow the `dataviz` skill for palette/axis/legend/tooltip consistency; category colour keeps
  coming from the one swatch scheme.

### 9. `feat: category colours, empty/loading/error states, a11y pass`

- Category colour override UI (§10.1 hybrid, the last deferred spec item): `⋯` → "Set colour" →
  Popover palette + "Auto". `Category.color` already exists in the schema and
  `createCategory`/`updateCategory` already accept it; `categoryDotColor(id)` becomes
  `categoryColor(category)` = `color ?? auto(id)`.
- Real empty states everywhere (invitations, §12.6), skeletons instead of "Loading…", first-run
  onboarding when there are no categories, sync error banner when persistent, `DriveError` surfaces
  via the existing `describeSyncError`.
- A11y: visible iris focus rings, `aria-label` on every icon-only control, contrast check on the new
  ramp, reduced-motion honoured, tab-bar landmarks, keyboard reachability of FAB + sheets.

### 10. `test: playwright e2e for the critical flows`

`@playwright/test` (dev dep) against `npm run dev`; desktop + mobile viewports; log expense, transfer,
create goal, approve inbox, view plan, filter the ledger, quick-add from the FAB.
*Risk:* browser download / `--with-deps` may need sudo on WSL. If the browsers cannot install, the
specs still land and I will report it plainly rather than claim coverage.

### 11. `docs: M11 merged, handoff prepped`

Update `HANDOFF.md`, spec §12 + §10.1, impl §4 M11.

---

## Verification

```bash
export PATH="/home/may/.nvm/versions/node/v22.18.0/bin:$PATH"
cd /home/may/github/yaccount
npm test                 # vitest — 407 green now; expect ~470+ after this pass
npm run typecheck
npm run lint
npm run build            # static export must stay clean
npx prettier --check .
npx playwright test      # after slice 10
npm run dev              # http://localhost:3000
```

Manual browser pass (the milestone's own exit criterion — UI has always been manual-verified here):
- DevTools device toolbar at 390×844 **and** desktop: every screen, tab bar, FAB, quick-add, filters.
- Log three entries in a row today → newest is on top (the bug fix).
- Existing DB upgrades v3 → v4 without losing data, and old rows get sensible ordering.
- Dark + light on every screen; `prefers-reduced-motion: reduce` kills motion.
- Break something on purpose (throw in a widget) → boundary catches it, toast + Copy diagnostics work.
- Sync still round-trips (M9 regression check).

---

## Unresolved questions

1. Bottom tabs = Home · Ledger · Plan · More. Inbox behind More w/ badge — or swap Plan out for Inbox?
2. Ledger stays at `/ledger` and dashboard at `/`. On mobile, open to Ledger instead?
3. Time-of-day: store + display only (my plan), or also make it user-editable in the edit sheet?
4. OK to add 3 deps — `loglevel`, `react-error-boundary`, `@playwright/test` (dev)?
5. Dashboard widget show/hide + reorder preference — worth it, or fixed order?
