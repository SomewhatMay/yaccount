# M11 — Design System & Polish — LIVE HANDOFF

> **You are picking this up mid-milestone. Read this file first, then `M11-PLAN.md` (the approved plan).**
> **Branch:** `m11-design-polish` (pushed to origin, 22 commits ahead of `main`).
> **Status:** Phases 1, 1.5, 2, 3, 4, 5, 6 and 7 of 10 are DONE, **user browser-tested and passed**,
> committed and pushed. **Phase 8 (category colours, empty/loading/error states, a11y) is next.**
> **Last updated:** 2026-07-22, after Phase 7 (Dashboard v2) passed its browser test (+ two follow-up fix rounds).

---

## 0. Read these, in this order, before writing any code

1. **This file** — where M11 actually is.
2. **`M11-PLAN.md`** — the approved plan for all 10 phases (in-repo copy; the original lives at
   `/home/may/.claude/plans/atomic-snacking-kurzweil.md`).
3. **`yaccount-tech-spec-v3.md`** — SOURCE OF TRUTH. **§12 is the design language and it is law.**
4. **`yaccount-implementation-details.md`** — build plan. §4 "M11" is this milestone.
5. **`HANDOFF.md`** — the milestone-level handoff for M0–M9 (history, invariants, gotchas).

`HANDOFF.md` §"Non-negotiable invariants" gates every milestone — op-log write path, integer cents,
the balance identity, reversibility, local-first instant open, per-device ledgers, the `src/core/`
purity boundary, and §12 compliance. None of that changes in M11.

---

## 1. What M11 is

The user's brief, verbatim in intent:

1. **Bug fixes** — ledger ordering (entries stored only a date, so recent entries didn't surface).
2. **Mobile-first UX overhaul** — the app is desktop-centred and awkward even on desktop. Floating
   quick-actions button, declutter Shortcuts, filtering within each tab.
3. **Visual identity & character** — "real boldness and character. We started this in M2; go further."
   Research mobile UX, then improvise something distinctly yaccount. Stand out without hurting UX.
4. **Dashboard & charts** — more widgets; research YNAB/Monarch/Copilot baselines and build on them.
5. **Error handling & logging** — errors weren't surfaced or logged; make issues easy to diagnose.

Plus M11's own spec scope (impl §4): motion, empty/loading/error/sync states, `DriveError` surfaces,
category-colour override UI, a11y pass, responsive density, Playwright e2e.

---

## 2. THE APPROVED DESIGN DIRECTION — "The Standing Register"

The user was shown three directions and **chose A**. This is settled; do not re-litigate it.
It is a **deliberate, documented extension of the LOCKED §12 "Quiet Register"** — same thesis, same
three typefaces, same iris/emerald semantics. Editing §12 in the spec is part of Phase 3's job
(invariant #8 permits it *by explicit decision*, which this was).

### Three new moves

1. **Paper & ink tinted with the brand hue.** The neutral field carries a trace of iris (h≈285) so it
   stops reading as default shadcn grey. Iris itself moves from timid 4% washes everywhere to **full
   strength, used rarely** (the FAB, the active tab, the focus ring).
2. **The figure standing on its own history.** The hero balance sits on a faint area curve of the
   trailing 90-day overall balance — the number has literal ground under it. Extends §12.7 signature #1.
3. **The carried balance.** Sticky day headers in the register print the running overall balance as of
   that day, like a paper check register. New structural device; information, not decoration.

Plus **the rule** (a hairline used ONLY above a total — it encodes "this sums the above") and
**Fraunces italic marginalia** (the accountant's pencil note).

### Token deltas (Phase 3 implements these)

```
             NOW (shadcn neutral)        A (paper & ink, hue 285)
 light bg    oklch(1     0    0  )       oklch(0.988 0.003 285)   rag paper
 light ink   oklch(0.145 0    0  )       oklch(0.180 0.015 285)   iris-cool ink
 light bord  oklch(0.922 0    0  )       oklch(0.900 0.006 285)
 dark  bg    oklch(0.145 0    0  )       oklch(0.155 0.012 285)   ink, not black
 dark  card  oklch(0.205 0    0  )       oklch(0.195 0.014 285)
 brand       oklch(0.54  0.20 280)       oklch(0.520 0.210 285)   ← full strength, RARE
 positive    oklch(0.58  0.13 162)       oklch(0.550 0.140 162)   ← shipped 0.530: 0.550 was 4.27:1

 + type      .figure-hero  Fraunces opsz/SOFT/WONK, clamp(2.75rem,12vw,4.5rem)
             .marginalia   Fraunces ITALIC
             .rule         hairline, ONLY above a total
             .leaders      dot leaders (Plan + summary tables only, NOT the dense register)
```

**Check contrast on the new ramp** — it must stay WCAG AA in both themes.

### Target screens (approved ASCII, build to these)

**Mobile — Ledger**

```
┌──────────────────────────────────────────────┐
│  ●  yaccount                        ☁   ☾    │
├──────────────────────────────────────────────┤
│  OVERALL BALANCE                             │
│                                              │
│   $4,182.40                                  │  Fraunces, fluid
│  ▁▂▃▃▄▅▄▆▇▇█▇▆▇█▇▆▅▆▇█                       │  ← 90-day balance
│                                              │     curve = its GROUND
│  This month   ↙ $2,140 in   ↗ $1,905 out     │
│  ‹ up $312 on last month ›                   │  ← Fraunces italic
├──────────────────────────────────────────────┤
│ ⌕ Search   [Category ▾][Wallet ▾][Type ▾][⇅] │  ← filter rail,
├──────────────────────────────────────────────┤     h-scrolls
│ TODAY ····························· $4,182.40│  ← STICKY. carries
│  ● Blue Bottle                               │     the running
│    Coffee · Wallet · 2:04 PM        −$4.50   │     balance, like a
│  ● Rent                                      │     check register
│    Housing · Wallet             −$1,850.00   │
├──────────────────────────────────────────────┤
│ YESTERDAY ························· $6,036.90│
│  ● Paycheck                                  │
│    Salary · Wallet              +$2,140.00   │  ← emerald
│  → Wallet → Emergency fund         $300.00   │  ← transfer, muted
└──────────────────────────────────────────────┘
                                     ╭───────╮
                                     │   +   │   ← iris FAB, bottom-right,
                                     ╰───────╯      floats above the bar
┌──────────────────────────────────────────────┐
│  ▣ Home    ≡ Ledger    ✉ Inbox ③    ⋯ More   │
└──────────────────────────────────────────────┘
```

> **Tab slots LOCKED by the user (2026-07-22): Home · Ledger · Inbox · More.**
> Inbox takes the third slot, not Plan. It is the actionable screen — recurring occurrences land there
> needing approval, and it already carries a live count (`pendingCountAtom`) — whereas Plan is a monthly
> read. The badge therefore sits on the Inbox tab itself rather than on "More", where a count is a weak
> signal. **Plan, Goals, Recurring, Containers, Categories and Settings live in the More sheet.** The
> desktop sidebar is unaffected: it lists every destination.

**Mobile — quick-add (the ONE orchestrated motion moment)**

```
tap +  →  sheet rises 260ms  →  log  →  row lands with a 200ms iris wash
┌──────────────────────────────────────────────┐
│                    ────                      │
│  SHORTCUTS                                   │  ← moved OFF the ledger
│  ⌘ Blue Bottle $4.50  ⌘ Metro $3.25  ⌘ Rent  │     (the declutter ask)
│                                              │
│  ┌ Expense ┐ ┌ Income ┐ ┌ Transfer ┐         │
│                                              │
│            −  $ 4 . 5 0                      │  ← big mono, decimal
│                                              │     keypad focused
│  What was it?   [ Blue Bottle           ]    │
│  Category       [ ● Coffee            ▾ ]    │
│  Wallet         [ Wallet              ▾ ]    │
│  Date           [ Today               ▾ ]    │
│                                              │
│  [             Log expense              ]    │  ← iris, full strength
└──────────────────────────────────────────────┘
```

**Mobile — Dashboard**

```
┌──────────────────────────────────────────────┐
│  Dashboard        [Last 3 months ▾]  [⚖]     │
├──────────────────────────────────────────────┤
│  SAVED THIS PERIOD                           │
│   $2,412.18                    ▲ 18%         │
│  ▁▂▄▃▅▇▆█                    vs prev period  │
├──────────────────────────────────────────────┤
│ ┌──────────┐┌──────────┐┌──────────┐┌────────│ ← KPI strip,
│ │ IN       ││ OUT      ││ RATE     ││ NET WO │   h-scroll
│ │ $8,420   ││ $6,008   ││ 28.6%    ││ $41,20 │
│ │ ▲ 4%     ││ ▼ 9%     ││ ▲ 6pt    ││ ▲ 2.1% │
│ └──────────┘└──────────┘└──────────┘└────────│
├──────────────────────────────────────────────┤
│  BUDGET PACE — July                          │
│  spent   ██████████████░░░░░░  71%           │  ← the YNAB-ish
│  month   ████████████████░░░░  74%           │     insight nobody
│  ‹ on pace · $412 left ›                     │     else derives
├──────────────────────────────────────────────┤
│  MONEY FLOW                                  │  ← recharts Sankey
│   Salary   ══╗                 ╔══ Housing   │     (recharts 3.10
│   Freelance ═╬═══ $8,420 ══════╬══ Food      │      exports Sankey —
│              ╝                 ╠══ Transport │      NO new dep)
│                                ╚══ Saved     │
├──────────────────────────────────────────────┤
│  SPENDING CALENDAR            Jun · Jul      │
│   M  T  W  T  F  S  S                        │
│   ░  ▒  ░  █  ▓  ▒  ░                        │  ← day heatmap
│   ▒  ░  ▓  ░  █  █  ▒     ▪ light  ▪▪▪ heavy │
├──────────────────────────────────────────────┤
│  WHERE IT WENT                               │
│      ╭─────╮   ● Housing    38%   $2,280 ▂▃▅ │  ← per-row
│     │ $6.0k │  ● Food       21%   $1,262 ▅▃▂ │     sparkline
│      ╰─────╯   ● Transport  12%     $721 ▂▂▃ │
├──────────────────────────────────────────────┤
│  TOP PAYEES        │  COMING UP (30 days)    │
│  Rent    $1,850    │  Jul 25  Rent   $1,850  │
│  Costco    $412    │  Aug 01  Gym       $45  │
│  Uber      $188    │  Aug 03  Netflix   $18  │
└──────────────────────────────────────────────┘
```

**Plan — where "the rule" and dot leaders earn their keep**

```
  INCOME EXPECTED                            $8,420.00
  ‹ from 2 recurring rules ›

  ALLOWANCES
   ● Groceries  ···························     600.00
   ● Housing  ·····························   1,850.00
   ● Transport  ···························     240.00
                                            ──────────   ← the rule
     Total allowances                          2,690.00

  GOAL ASKS
   ◎ Emergency fund  ······················     400.00
   ◎ Japan trip  ··························     250.00
                                            ──────────
     Total asks                                  650.00
                                            ══════════
     UNALLOCATED                              5,080.00
```

**Desktop**

```
┌─────────┬──────────────────────────────────────────────────────────┐
│ ● yacct │  Ledger                          ⌕ ⌘K    ☁   ☾    ⋯      │
│         ├──────────────────────────────────────────────────────────┤
│ ▣ Home  │   OVERALL BALANCE                                        │
│ ≡ Ledger│    $4,182.40        ▁▂▃▃▄▅▄▆▇▇█▇▆▇█▇▆▅▆▇█                │
│ ✉ Inbox③│    this month · $2,140 in · $1,905 out                   │
│ ◈ Plan  │  ┌────────────────────────────────────────────────────┐  │
│ ◎ Goals │  │ 📅 today   What was it?    −  $0.00   ● Coffee   + │  │
│ ↻ Recur │  └────────────────────────────────────────────────────┘  │
│ ▤ Wallet│   ⌕ Search  [Category ▾][Wallet ▾][Type ▾][⇅ Newest]     │
│ ⬢ Categ │  ────────────────────────────────────────────────────    │
│         │   TODAY ···································· $4,182.40   │
│ ⚙ Setng │    ● Blue Bottle   Coffee · Wallet · 2:04pm  −$4.50   ⋯  │
└─────────┴──────────────────────────────────────────────────────────┘
   sidebar ≥1024px          bottom tab bar + FAB below that
```

**Why A and not something bolder:** the rejected "bolder re-cut" (new display face, second accent hue,
filled accent cards, big radii) is exactly the generic fintech card-stack §12.1 was written to reject —
bolder in volume, weaker in identity. A spends its boldness on three things no other budgeting app
does. Keep that discipline.

---

## 3. Phase table — where we are

| # | Phase | Status |
|---|---|---|
| 1 | Entry timestamps + ledger ordering | ✅ **DONE** — `02d72a5`, user-tested PASS |
| 1.5 | Editable entry time (user follow-up) | ✅ **DONE** — `96be47a`, user-tested PASS |
| 2 | Logging, error boundaries, diagnostics | ✅ **DONE** — `97228ca`, user-tested PASS |
| 3 | Design system v2 (tokens/type/motion) + spec §12 edit | ✅ **DONE** — `7b5a4c2`, user-tested PASS |
| 4 | Mobile shell (tab bar, sidebar, FAB, quick-add, ⌘K) | ✅ **DONE** — `2e4d6cc`, user-tested PASS |
| 5 | Ledger v2 (history curve, carried balance, filters/sort) | ✅ **DONE** — `14650d7` + `afaa8de`, user-tested PASS |
| 6 | Filters + mobile density on the other 5 list views | ✅ **DONE** — `acf8f26` + `3683b74` + `b0483b4` + `7372a80`, user-tested PASS |
| 7 | Dashboard v2 (KPIs, pace, Sankey, calendar, payees, upcoming) | ✅ **DONE** — `bff1dc8` + `432a770` + `7de2c5f` + `cfe1bfb`, user-tested PASS |
| 8 | Category colours, empty/loading/error states, a11y | ⬜ **NEXT** |
| 9 | Playwright e2e | ⬜ |
| 10 | Docs (spec §12, impl §4, HANDOFF) | ⬜ |

**Working protocol the user asked for and has been enforcing:**
- **One phase at a time.** Build it, verify it, commit it, then **STOP** and hand back for browser testing.
  Do not start the next phase until they say so. "No jumping the gun, no overdoing, no mistakes."
- **Ground every change in the code**, not in memory or in this document. Re-read the files you touch.
- **TDD**: write failing tests, confirm they're red for the right reason, then implement.
- Each phase must be **browser-testable by the user**. Pure-engine work folds into the phase that
  consumes it — an engine-only commit can't be verified.
- End each turn with what to test, and any open questions (concise).

---

## 4. What Phases 1–2 actually delivered

### Phase 1 — `02d72a5` "order the ledger by when entries were written"

**The bug:** rows carried a calendar date but no clock. Everything logged in one afternoon shared a
`date`, so `LedgerView` tie-broke on `id` — a random UUID.

- **`transactions.entered_at`** — zoned ISO instant, `zIsoDateTime.nullable()`, a **required key**
  (matches this repo's explicit stance in `schemas.test.ts` "nullable fields are required keys").
  `date` stays the backdatable calendar day: widening it would have broken `yearMonthOf`,
  `budgetOnDate`, `inRange` and the occurrence math, with no sane value for a backdated row.
- **Commands stamp `entered_at` from the op's own `ts`** (already the total order's sort key) — one
  clock read, journal and state agree, deterministic under injected `OpMeta`.
- **`applyOp` fills it from `op.ts`** when a payload lacks one (older client, recurring generator).
  Pure in the op, so replay stays deterministic and the `state == replay(listOps())` invariant holds.
- **`makeVoidRow` never inherits the original's instant** — a reversal is its own event.
- **`sortForRegister`** in `core/engine/ledger.ts`: date desc, `entered_at` desc, `id` last; rows with
  no instant sink within their day.
- **One-shot backfill in `Repo.init()`** stamps pre-M11 rows from their earliest op, guarded by an
  `app_meta` marker (`migration:entered_at`), retried on next open if it fails.
  **⚠ NO `DB_VERSION` BUMP — deliberate.** IndexedDB records are schemaless; a new field needs no
  upgrade, and bumping would trip `blocked()` in other tabs and lock out older builds for nothing.
  `DB_VERSION` is still **3**.
- **Also fixed a UTC-date bug in the same family.** 13 views derived "today" from
  `new Date().toISOString()` — the *UTC* day. The user's machine is **UTC-4**, so after 8pm every entry
  was filed on tomorrow's date, under the wrong day header, in the wrong reporting month at a boundary.
  New **`src/features/clock.ts`** reads the local calendar; `yesterdayIso` is calendar arithmetic so it
  survives the 23-hour DST day. **Use `todayIso()` / `thisMonthIso()` from `@/features/clock` — never
  `toISOString().slice()` — in any new UI code.** (`syncAtom`'s archive `yearMonth` stays UTC on
  purpose: it names Drive files across devices.)

### Phase 1.5 — `96be47a` "make an entry's time editable"

User feedback after testing Phase 1: *"I can adjust/edit the date, but not the time. Fix that."*

- Edit sheet: `Date` + `Time` side by side (`WhenFields`), on **both** the expense/income and transfer
  forms. Re-dating carries the time of day onto the new day.
- Compose bar: date input became **`datetime-local`** (grid widened to `13rem`).
- `createTransaction`/`createTransfer` take optional `entered_at`; op `ts` is the default, caller wins.
- **Two precision traps closed** (both would have reintroduced the very tie the field exists to remove):
  - `resolveEnteredAt` leaves the instant untouched unless date/time actually changed — a time input is
    minute-resolution, so rebuilding on every save would round seconds off rows logged seconds apart.
  - `instantFromNow` keeps the user's chosen minute but takes **seconds from the clock**, so pinning a
    time and logging three receipts doesn't give all three one instant.

### Phase 2 — `97228ca` "surface and log failures instead of swallowing them"

- **`src/lib/log-buffer.ts`** — 300-record ring, **redacts on the way IN** (ya29 tokens, JWTs,
  `*_token` fields, `Bearer` headers, emails) so a secret is never held in memory. Device id is
  deliberately **kept** — sync bugs need it.
- **`src/lib/errors.ts`** — `describeError` normalizes Error / DriveError-shaped / string / undefined
  into one legible line, reading `.status`/`.body` **structurally** so `src/lib` never imports the sync
  seam. `markHandled`/`isHandled` (shared symbol, non-enumerable) tag an error already shown to the user.
- **`src/lib/logger.ts`** — named loggers over `loglevel`. **The buffer is fed BEFORE loglevel gets a
  say**: loglevel no-ops methods below the active level, so the obvious `methodFactory` hook would have
  captured nothing exactly when the console was quiet. Full trail in memory, calm console.
  Log level is exposed as a subscribable store (`subscribeLogLevel` + `SSR_LOG_LEVEL`) so the UI reads
  it with `useSyncExternalStore` — **this repo's ESLint forbids `setState` inside an effect**
  (`react-hooks/set-state-in-effect`); do not work around it with a lint disable.
- **`src/features/ErrorBoundary.tsx`** — per-SECTION boundary (a bad chart costs you the chart, not the
  ledger), names what broke, `resetKeys`, plus a shared `CopyButton`.
- **`src/app/error.tsx`** (screen) and **`src/app/global-error.tsx`** (self-contained: plain elements +
  inline styles, because the thing that failed may be the stylesheet or provider it would otherwise use).
- **`RepoBootstrap`** installs `window.onerror` + `unhandledrejection`, throttled 4s, skipping handled.
- **`dispatchAtom`** logs + toasts once, then **rethrows marked handled** — the caller skips its success
  path, so a form keeps what was typed and no false "Logged" toast fires. This covers ~40 call sites.
- **`bootstrapAtom`** separates fatal (DB open → `bootErrorAtom`) from optional (recurring generation,
  goal maintenance now fail independently instead of taking boot down).
- **`AppShell`** renders a real boot-failure screen naming the likely cause (was: 8 screens stuck on
  "Loading…" forever).
- **`/settings`** (new route, gear icon in the header's right cluster — deliberately NOT in the nav row)
  holds `DiagnosticsPanel`: install facts, live log, level control, **Copy diagnostics**, and a
  **dev-only self-test** with three buttons hitting the three distinct failure mechanisms.

**New deps:** `loglevel`, `react-error-boundary`. `npm audit` reports 6 **pre-existing** vulns from
`shadcn`'s CLI and Next's transitive deps — neither new package contributes, and `audit fix --force`
would downgrade Next to 9.x. Left alone deliberately.

---

### Phase 3 — `7b5a4c2` "design system v2: tinted paper, the figure scale, the rule"

**User browser-tested and passed** ("looks much better"). No follow-up complaints — unlike Phase 1,
this one needed no fix round.

- **`globals.css`** — the whole ramp retinted to h≈285 in both themes (light + dark restated in full: the
  yaccount blocks come *later* at equal specificity, so `.dark` must repeat every token `:root` sets or
  the light value wins in dark mode). New `--surface-sunken`, `--rule`, `--dur-1/2/3`,
  `--ease-register`. Devices in `@layer components` (so a Tailwind utility at the call site still wins):
  `.figure-hero/-lg/-md`, `.marginalia`, `.eyebrow`, `.rule`, `.rule-double`, `.leaders`, `.tnum`.
  Global `prefers-reduced-motion` kill switch.
- **Two token values differ from the direction's table, both for contrast, both computed not guessed:**
  `--positive` light `0.550 → 0.530` (the proposed value scored **4.27:1**, under AA) and
  `--muted-foreground` light `0.525` (so it clears AA on `--surface-sunken` too). Everything else is the
  approved table.
- **`theme.test.ts` is the guard.** It parses `globals.css`, resolves `var()` indirection, converts
  oklch → sRGB (pure `contrast.ts`) and fails on: any read pair below AA in either theme, a focus ring
  below 3:1, an untinted neutral, a missing device class, a missing motion token, or a `--rule` that
  doesn't read harder than `--border`. **Change a token and this test tells you what it costs.**
- **`layout.tsx`** — Fraunces now loads `style: ["normal","italic"]` + `axes: ["SOFT","WONK","opsz"]`.
  The build accepted the axes and emits both faces; no fallback needed.
- **`src/features/ui/`** — `Figure`, `Money`, `Eyebrow`, `Marginalia`, `RuledTotal`, `LeaderRow`,
  `Sparkline`, `ResponsiveSheet`, `EmptyState`, `ListSkeleton`/`FigureSkeleton`, plus pure
  `geometry.ts` (`sparklinePath`) and `contrast.ts`, and `useMediaQuery` (`useSyncExternalStore` —
  the repo forbids setState-in-effect). Barrel at `@/features/ui`.
- **Adopted, not just shipped:** ledger hero → `Figure`; all 17 hand-rolled eyebrows → `Eyebrow`;
  page titles → `.figure-lg`; ledger day header → sunken eyebrow strip; ledger amounts → `Money`;
  Plan rebuilt onto `LeaderRow` + `RuledTotal` (totals moved **under** the rows they sum, double rule on
  Unallocated); `Loading…` → skeletons on Ledger + Plan; all **five** edit sheets → `ResponsiveSheet`
  (bottom on mobile, right on `sm+`).
- **Real bug found and fixed:** an unlayered `body { font-family: system-ui }` left over from the shadcn
  scaffold outranked every layered rule — **body copy had never been rendering in Geist**, despite
  §12.3 and `font-sans` on `<body>`. Unlayered CSS beats all `@layer` CSS; don't add rules outside a layer.
- **Spec §12 edited deliberately** (invariant #8's explicit-decision path), retitled "The Standing
  Register", changed passages marked **(M11)** in place: §12.1 (the three moves + why the louder cut was
  rejected), §12.2 (token table, the "no washes" rule, the AA guarantee, caller-chosen tone), §12.3
  (figure scale table, marginalia, eyebrow), §12.4 (carried day header, the rule, leaders, responsive
  density), §12.5 (motion budget, the one orchestrated moment, reduced motion), §12.7 (third signature),
  §12.8 (compose the primitives). Mirrored in impl §4 M11.
- **Not done here, on purpose:** the hero history curve and the carried balance need engine series
  (`overallBalanceSeries`) — **Phase 5**. `Money` was adopted only where files were already being
  touched; the remaining ~60 `formatCents` call sites convert as later phases rewrite those screens.
- Tests **494 → 573** (+79: 9 geometry, 15 contrast, 55 theme). Typecheck/lint/build/prettier clean.

### Phase 4 — `2e4d6cc` "mobile shell: tab bar, sidebar rail, quick-add FAB, ⌘K"

**User browser-tested and passed** ("looks good"). No fix round needed.

- **`src/features/shell/nav.ts`** — ONE destination registry (href/label/icon/hint) read by all four
  navigation surfaces: the tab bar, the desktop rail, the More sheet and the palette. `nav.test.ts`
  holds the locked slots, that the badge is on Inbox, and that **tabs ∪ More = every destination** —
  a screen present on one surface and forgotten on another is unreachable there, and on a phone that
  means unreachable full stop.
- **`AppShell.tsx` rebuilt.** `< lg`: sticky compact top bar (wordmark · sync · theme) + `BottomTabBar`
  (Home · Ledger · Inbox · More, pending badge on Inbox, `env(safe-area-inset-bottom)`), `main` padded
  `calc(7rem + safe-area)` so the last register row is never under the bar. `≥ lg`: fixed 14rem
  `SidebarRail` (all 8 destinations + Settings + the account control in its footer), tab bar gone,
  content offset by `lg:pl-56`. The reading column is unchanged (`max-w-2xl`, dashboard `max-w-5xl`).
  **`AppNav.tsx` is deleted** — its pieces are `shell/TopBar.tsx` + `shell/SidebarRail.tsx`.
- **Active state = full-strength iris on the icon and label, and nothing else.** No pill, no tinted
  plate: the old `bg-primary/10` nav pill was exactly the 4%-iris-everywhere habit §12.2 (M11) removed.
- **`shell/QuickAddFab.tsx`** — iris FAB, `size-14`, above the tab bar on a phone
  (`bottom-[calc(4.25rem_+_env(safe-area-inset-bottom))]` — note the underscores; `calc(4.25rem+…)`
  without whitespace is invalid CSS and the rule is dropped silently), corner-anchored from `lg`.
- **`shell/QuickAddSheet.tsx`** — the shortcuts strip **moved here off the ledger** (the declutter ask).
  Expense/Income/Transfer segmented control, big mono amount with the `SignToggle`, then payee /
  category / container / when. The form is mounted only while open, so each visit starts on the kind
  that asked for it with an empty amount and the clock rolled forward.
- **§12.5's one orchestrated moment is built:** tap **+** → sheet rises (`--dur-3`) → log → the row
  lands in the register carrying a single iris wash (`bg-primary/15`) that settles on `--dur-2`. The
  hold is *state*, not motion (`flashRowAtom`, 1400ms), so no fourth duration was invented.
  **`src/components/ui/sheet.tsx` now uses the budget tokens** (`--dur-3` content, `--dur-2` scrim,
  `--ease-register`), so all five edit sheets obey §12.5 too.
- **`ledger/compose.ts` (pure, tested) + `ledger/useComposeFields.ts` (state).** The bar and the sheet
  were about to become two implementations of the soft sign rule (§5.4) — and the one that drifted
  would be the one writing to the journal. Now: one pure `composeOp` (error / confirm / ready), one
  hook, two layouts. `ComposeBar` lost its `onSubmit` prop; the hook dispatches, toasts, flashes the
  landed row and resets.
- **`shell/CommandPalette.tsx`** (⌘K / Ctrl-K) — go to any screen, log expense/income/transfer, sync
  now, toggle theme, and **search the register** via the new pure `searchTransactions` in
  `core/engine/ledger.ts` (every word must match, in any order; caller supplies the extra label text so
  the engine keeps no category lookup). Selecting a row lands on `/ledger` with it flashed *and*
  scrolled into view. Filtering is ours (`shouldFilter={false}`), not cmdk's, so one rule covers all
  three groups. The rows memo is gated on `open` — the palette lives in the shell and would otherwise
  re-sort the register on every write, on every screen.
- **`shell/MoreSheet.tsx`** — Plan/Goals/Recurring/Containers/Categories/Settings, each with its hint,
  plus the account control, search and the theme toggle. A sheet, not a route, so it is never a dead
  end. **Settings therefore left the header**: rail footer on desktop, More sheet on a phone.
- **Two real bugs fixed on the way:** shadcn's `command.tsx` renders its `DialogTitle` *outside*
  `DialogContent`, which leaves the palette unnamed to a screen reader and logs an a11y error — moved
  inside. And `createTransaction`/`createTransfer`/`logTemplate` now return the named
  **`TransactionCreateOp`** (`core/oplog/types.ts`) so a caller can read the row it just wrote without
  narrowing the whole `Op` union at the call site.
- **New dep: `cmdk`** (pulled by `npx shadcn add command`, which also copied in `dialog`, `input-group`
  and `textarea` — all three are `command.tsx`'s own imports). `tabs.tsx` was pulled and then
  **deleted deliberately**: the kind selector uses the existing `ToggleGroup`, which is the same recipe
  the compose bar already ships and is semantically a radio group, not a set of tab panels.
  **`globals.css` was NOT touched by the CLI** — check that every time you run `shadcn add`.
- Tests **573 → 608** (+35: 12 nav, 18 compose, 5 searchTransactions). Typecheck/lint/build/prettier clean.

### Phase 5 — `14650d7` "ledger v2: the figure on its history, the carried balance, filters" (+ `afaa8de` fixes)

**User browser-tested and passed** after one fix round (the three items in `afaa8de`, below).

- **`core/engine/balances.ts` — `overallBalanceAsOf(txns, containers, iso)` and
  `overallBalanceSeries(txns, containers, days[])`.** The §5.7 counted rule (`include_in_overall_balance
  && !is_archived`) wound back to a day, over the §0.4 identity summed across the counted SET rather
  than per container (`overallDelta`) — a transfer between two counted containers cancels itself out.
  The series is **one ordered pass**: deltas sorted once, days walked **ascending internally** and
  mapped back to the caller's order, so unsorted days give right answers instead of a silently wrong
  curve. Reversals count like any row, so a deleted entry stands in the running balance until the day
  its reversal is dated (which is what a check register does).
- **`core/engine/period.ts` — `trailingDays(today, count)`**, ascending, `date-fns` `subDays` on the
  existing local-midnight `parseDay`. Phase 7's spending calendar wants the same helper.
- **`core/engine/filter.ts` (new) — `TransactionFilter` + `matchesFilter`/`applyFilter`/
  `activeFilterCount`/`isFilterActive`/`transactionKind`.** ONE predicate: `searchTransactions` is now
  its **text half**, not a second matcher, so ⌘K can never find a row the ledger's rail hides.
  Details that matter: a wallet filter matches **either leg** of a transfer; amount bounds read the
  **SIZE** of an entry, not its sign; an **empty facet array means "all", not "none"** (the UI clears a
  facet by emptying it); `transactionKind` uses `amount >= 0` ⇒ income, the same rule the register
  colours by. `activeFilterCount` counts **facets**, not values, and a range counts once.
- **`core/engine/ledger.ts` — `sortRegister` + `REGISTER_SORTS`/`isRegisterSort`.** `oldest` is
  literally `sortForRegister(...).reverse()` (the exact inverse comparator, so they can't drift);
  `largest`/`smallest` stable-sort by `|amount|` over the register-ordered array, so ties keep register
  order and two devices agree (§8.5).
- **`src/features/prefs.ts` (new)** — `pickPref`/`readPref`/`writePref`/`useLocalPref` over
  `useSyncExternalStore` (module listener set + cross-tab `storage` event; server snapshot = the
  fallback). Storage is a convenience, never a dependency — SSR and blocked storage both render the
  fallback. **A stored value this build doesn't recognise falls back** rather than putting the UI in a
  state it has no code for. **Phase 7 should reuse this for widget-collapse state.**
- **`src/features/clock.ts` — `lastMonthIso`**, built from the month field (stepping back days would
  put Mar 31 in March again).
- **The hero stands on its trailing 90 days.** `Figure` already drew the curve; Phase 5 fed it.
  `series` is omitted entirely when nothing is logged — a flat line at zero is not a story. Added the
  approved screen's marginalia (`‹ up $312 on last month ›`, this month's net vs last month's), shown
  only once last month has rows.
- **The carried day header (§12.4 M11)** — sticky `top-14` (the `TopBar` is `sticky top-0 h-14 z-30`),
  `z-10`, on `--surface-sunken`, day eyebrow + carried `Money` on `.leaders`. **Hidden whenever a
  filter is active.** `.leaders` is applied **only when the figure shows** — with a single child its
  `::before` rail would shove the label to the right.
  **⚠ The register card had to become `overflow-clip`, not `overflow-hidden`:** `overflow: hidden`
  establishes a scroll container, so the sticky header would stick to the card (which never scrolls)
  instead of the viewport. `clip` still rounds the corners and creates no scroll container. **The other
  12 `overflow-hidden` cards were left alone — change one only when it gains a sticky child.**
- **`src/features/FilterBar.tsx` (new)** — search + facet chips + range chips + sort + count + Clear, on
  `--surface-sunken` (§12.2 names it for filter rails), h-scrolling below `sm`. **Written generic over
  `facets`/`ranges`/`sort` so Phase 6 WRAPS it rather than forking it.** Chips are `Popover` +
  `Checkbox`. Sort persists, **filters do not**.
- **A size sort drops day grouping** — "largest" ranks across days, so the date moves onto the row, a
  quiet `divide-y` replaces the headers, and nothing pretends to carry a running balance.
- **Press state is a colour (`active:bg-muted/60`), not a transform** — §12.5's budget is three
  durations and one curve, with no scale in it. Flagged to the user; they accepted it.
- **New shadcn `popover`** (its only import is `radix-ui`, already a dep — **no new npm package**).
  Retuned to the motion budget (`--dur-2` + `--ease-register`) like Phase 4 did to `sheet.tsx`.
  **`globals.css` was NOT touched by the CLI** — checked, as always.
- Tests **608 → 659** (+51: 12 balances-through-time, 5 trailingDays, 19 filter, 7 sortRegister, 3
  lastMonthIso, 5 prefs). Typecheck/lint/build/prettier clean.

**Fix round `afaa8de` (user feedback after testing) — keep these:**
1. **The compose bar is GONE from the ledger,** and `ledger/ComposeBar.tsx` is **deleted** (nothing else
   imported it). The FAB + quick-add sheet write from every screen, so a second permanently-expanded
   copy of the same form between the figure and the register earned nothing. **The write rule never
   lived in the bar** — it is `ledger/compose.ts` + `useComposeFields`, which the sheet uses. The
   §12.4 compose-bar **pattern is untouched**: Categories and Containers still create that way.
   **Do not put an inline compose bar back on the ledger.**
2. **A filter option is clickable to its edges.** The `<Label>` had wrapped only the text, so the row's
   padding highlighted on hover and swallowed the press. Now the label IS the row (`w-full`, `py-2`,
   `pl-8`) with the `Checkbox` absolutely positioned over it. Note the reason it is not a `<label>`
   *wrapping* the checkbox: Radix renders a `<button>`, and a label containing its own control leaves
   "did that click toggle once or twice" to the browser.
3. **Shortcut chips stack** — name on line one, amount on line two, `w-32` cards in the scrolling strip.
   One long pill each ran the strip off the screen after three.

### Phase 6 — `acf8f26` "filters and mobile density on the other five list views" (+ 3 fix rounds)

**User browser-tested and passed** after three rounds of feedback (`3683b74`, `b0483b4`, `7372a80`).

- **`FilterBar.tsx` was NOT edited.** Five views supply their own facets, ranges, sort and count. It
  turned out to be exactly as generic as Phase 5 hoped; treat that as proof the seam is right.
- **The Inbox narrows through `core/engine/filter.ts` directly** (`applyFilter` over `pendingRows`,
  `sortRegister` for order). Added **`ruleIds`** to `TransactionFilter` — `recurring_rule_id` is a real
  transaction column, so the Inbox's one extra question stays *inside* the one predicate rather than
  spawning a second. The rule facet lists **only rules with something actually pending**; a facet full
  of dead ends is a worse menu than no menu.
- **Four new per-view predicates**, because goals/rules/containers/categories are not transactions:
  `features/{goals,recurring,containers,categories}/filter.ts`, each `matchesX`/`applyXFilter`/
  `activeXFilterCount` + `X_SORTS`/`isXSort`/`sortX`. They borrow **`terms` / `matchesWords` /
  `constrains`** (now exported from `core/engine/filter.ts`) so "typing narrows" and "an emptied facet
  means all" mean ONE thing on all six screens. Anything derived — a goal's progress, a container's
  balance, a category's budget-on-a-date — arrives through a context callback, so the predicates stay
  pure and clock-free.
- **`features/filter-draft.ts` (new)** — `FilterDraft`/`NO_FILTER`/`boundCents`/`toFilter`, lifted out of
  `LedgerView` and now shared with the Inbox. `boundCents`' "a half-typed bound is not a bound" rule was
  untested while it lived in the view; it is tested now.
- **Every comparator ties on name then id** so two devices agree (§8.5), and each returns a new array.
  Null sinks last in every ranking: no deadline is not "due first", and no budget is not a budget of £0.
- **Sorts persist** (`yaccount.{inbox,goals,recurring,containers,categories}.sort`, each with a
  validator); **filters do not**. Same rule as the ledger.
- **`features/ui/RowActions.tsx` (new) — a real bug, not a polish item.** Row `⋯` menus were
  `opacity-0` + `group-hover:opacity-100`. **A phone has no hover, so on touch there were NO row actions
  at all** — no rename, no pause, no reported balances, no "save as shortcut". Now
  `pointer-coarse:opacity-100`, in ONE component instead of six copies of the class list (the ledger's
  included). Verified in the built CSS that the `@media (pointer: coarse)` block emits *after*
  `.opacity-0`, so it wins.
- **`features/ui/CollapsibleSection.tsx` (new)** — archived/paused sections fold, **closed by default**,
  count in the header. New shadcn `collapsible` (imports only `radix-ui`, already a dep — **no new npm
  package**; `globals.css` untouched, checked).
- **Inbox density**: the selection bar was **440px wide in a 350px column** (horizontal page scroll,
  which §12.4 forbids) and `sticky top-2` under a `sticky top-0 h-14 z-30` bar, so it slid underneath.
  Now short labels + `flex-wrap` + `top-16 z-20`. Rows left **~20px for the payee**; Approve is
  icon-only below `sm` and gaps tighten to `gap-2` → ~110px.
- **A selection is over what you can SEE** — `liveSelection` is scoped to the *filtered* rows, so
  narrowing drops hidden rows out of it and "Approve selected" can never act off-screen. Related trap
  fixed in `GoalsView`: the "you already have an active goal for that container" check now runs against
  **all** active goals (`activeGoals`), not the filtered list — a rule about what may exist cannot depend
  on what happens to be on screen.
- Hand-rolled empty `<div>`s → `EmptyState`, each view distinguishing "nothing here yet" from "nothing
  matches those filters" (with a Clear action).
- Tests **659 → 715** (+56: 19 goals, 17 recurring, 12 containers, 15 categories filter/sort, 7
  filter-draft, plus `ruleIds` and the shared text primitives in the engine).

**Fix round 1 — `3683b74` "one create surface everywhere, and a header that fits a phone":**
1. **THE INLINE COMPOSE BAR IS RETIRED.** Categories and Containers were the last two; they now use
   `CategorySheet` / `ContainerSheet` over `ResponsiveSheet`, opened by the page header's **New**
   action. **§12.4 was edited deliberately** (invariant #8's explicit-decision path — the user's call
   after using both in a browser), and impl §2 + `HANDOFF.md`'s banner were mirrored.
   `border-primary/15 bg-primary/[0.04]` is **gone from the app**, so §12.2's "no low-opacity iris
   washes" rule now holds with no exception at all. **Do not rebuild a compose bar.**
   **Rename stays inline** (§12.4-a, unchanged), and the container's counted/investment/default
   switches stay in the row's `⋯` menu — they edit something that already exists.
2. **`features/ui/PageHeader.tsx` (new)** — the **New** action sits on the **eyebrow's** line, never the
   title's. Beside a fluid `.figure-lg` serif title and a paragraph it ate a third of a 390px column:
   the title wrapped and the lede squeezed. `min-h-8` on that row is the button's own height, so the
   Inbox (no action) sits its title at exactly the same place as the four that have one. All five list
   screens share it, which also settled two drifted headers — Containers and Categories had no eyebrow
   and a title that just repeated the nav label; they now read "Where your money lives" / "What your
   money does".
3. Empty states gained the create action ("No categories yet" with no way to add one was an invitation
   with nothing to accept).

**Fix rounds 2 & 3 — `b0483b4` + `7372a80`, the container's counted choice:**
- The "not counted in your overall balance yet" toast was a surprise you met *after* the fact, with the
  fix at the far end of a `⋯` menu. The choice is now **on the create form**. `createContainer` already
  took the flag and `commands.test.ts` already covered both branches — pure UI wiring, no test delta.
- **The default is still NOT counted.** §5.7's opt-in model is locked; what changed is that the decision
  is *visible*, not which way it goes.
- Shipped first as a checkbox, then (round 3) as a **segmented pair** — a checkbox with its sentence
  beside it was the one control shaped differently from the rest of the sheet, and on a phone the
  sentence wrapped around the box. Every field on both create sheets is now the same block: **label →
  segmented pair → one line of meaning**, default option leftmost (Wallet before Investment, Expense
  before Income, Not counted before Counted).

---

### Phase 7 — `bff1dc8` "dashboard v2 — a widget registry, and nine derivations to fill it" (+ 3 follow-ups)

**User browser-tested and passed** after two rounds of feedback (`432a770` drill-downs, `7de2c5f` the
URL-timing fix, `cfe1bfb` the Clear button). Tests **715 → 788**.

- **The screen is a LIST, not a layout.** `src/features/reports/registry.tsx` is `DASHBOARD_WIDGETS` — 16
  entries of `{ id, title, defaultVisible, bare?, fixedWindow?, render(ctx) }`. `DashboardView.tsx` owns
  only the period + the data + the ORDER; it has no chart in it. The move-anything-around widget system
  the user wants next is now a different *list*, not a teardown. `registry.test.ts` pins the ids
  (they are stored-preference keys) and the invariants (one opening figure, which widgets are bare, which
  are fixed-window). **Each `render` returns a COMPONENT** so the widget owns its own memoised
  derivations — inline hooks would belong to the dashboard and break on reorder.
- **`WidgetShell.tsx`** wraps every non-bare widget: the fold (persisted per id via `useLocalPref`, as
  `"open"|"closed"`), the per-widget period override (§6.1, a `⋯` menu of presets, `RowActions`), and a
  per-widget `ErrorBoundary` named after the widget. `bare` widgets (the hero, the KPI strip) get none of
  that — they are the screen's opening statement.
- **Nine new pure engine derivations, TDD against hand-computed fixtures** (all in `src/core/engine/`):
  `periodSummary`/`comparePeriodSummary`, `dailySpend`, `topPayees`, `largestTransactions`,
  `savingsRateSeries`, `categoryTrendSeries`, `sankeyFlows` (`reporting.ts`); `budgetPace` (`budgets.ts`);
  `upcomingOccurrences` (`recurring.ts`); plus `precedingRange` + `PERIOD_PRESETS`/`isPeriodPreset`
  (`period.ts`) and `TRANSACTION_KINDS` (`filter.ts`). Judgement calls worth keeping: `precedingRange`
  compares equal DAY COUNTS not calendar months; a rate moves in POINTS not percent; an overspend enters
  the Sankey as a `drawdown` strand so the picture balances; `upcomingOccurrences` READS the grid and
  generates nothing (opening the dashboard must never fill the Inbox); `budgetPace` draws the month as its
  own bar so "71% spent" is legible as early/late.
- **The reporting period now persists** (`features/reports/period-pref.ts` over `prefs.ts`). The old
  `reportingPeriodAtom`/`comparePeriodAtom` are **deleted** — a period is a device-local view preference,
  never the op log. It survives a refresh now, keyed `yaccount.dashboard.{period,compare}`, and each
  widget's fold/window are `yaccount.dashboard.{open,window}.<id>`.
- **§12.4's last table debt paid.** `ContainerFlowsTable` and `BudgetComparisonTable` (the only `Table`
  consumers left in the app) collapse to card rows below `sm`. `PageHeader` now also carries the
  dashboard, Plan and Settings; its eyebrow no longer shrinks.
- **Charts follow the `dataviz` skill** for form (gridlines de-dashed, solid; one hue for the calendar
  heat, bucketed by the reader's own quartiles) but the palette stays **§12.2 semantic tokens +
  `categoryDotColor(id)`** — the skill's palette is a placeholder, ours wins. Deltas carry an arrow, not a
  colour (§12.2 spends emerald only on money coming in). recharts 3.10's `Sankey` needed no new dep;
  `sankey-layout.test.ts` runs its real layout pass over the engine output (the one automated proof the
  chart renders before Playwright) via a deep import typed in `recharts-sankey.d.ts`.
- **Dashboard numbers are doors into the ledger** (`432a770`). New pure `features/ledger/deep-link.ts`
  (`ledgerHref`/`parseLedgerQuery`, tested) turns a drill-down into a real `/ledger?…` URL and reads it
  back into the rail's `FilterDraft`. **Made interactive, deliberately:** a breakdown category → that
  category over the window; a top payee → the register searched for it; a largest entry → that exact row
  flashed; a calendar day WITH spend → that day. **Left alone on purpose:** the Money flow (strands too
  thin — the user's explicit call), the hero/KPIs (summaries, no single target), budget pace, upcoming,
  goals, and the doughnut SEGMENTS (the legend row beside each is the honest target). Whole-row hit areas,
  one quiet hover.
- **Two real bugs found and fixed on the way:** `Sparkline` spread `...props` after `style={{height}}`,
  so any caller passing `style` (the category-tinted legend sparkline) silently lost its height. And the
  deep-link filter had to seed from **`useSearchParams`, not `window.location`** — during a client `<Link>`
  navigation the address bar updates a beat after the destination first renders, so reading the window
  seeded an empty filter while the URL visibly carried one (`7de2c5f`). Static export needs a Suspense
  boundary around `useSearchParams`; `src/app/ledger/page.tsx` has one, with a skeleton fallback.
- **`cfe1bfb`:** the filter `Clear ×N` button is pinned OUTSIDE the scrolling chip rail now (always
  visible on the right, rail adjacent to its left) — it used to be the last item inside the scroll.

---

## 5. Phase 8 — what to do next

From `M11-PLAN.md` §9 ("category colours, empty/loading/error states, a11y pass"). Three strands, all UI,
no new engine. **Re-ground each in the code before you start; do not work from this summary.** The user
tests each phase in a browser — end your turn with what to test, then STOP.

### Strand 1 — the category-colour override UI (the last deferred SPEC item, §10.1)

Spec §10.1 is a **hybrid auto-palette + per-category override**. The auto half shipped at M5
(`categoryDotColor(id)`); this phase adds the override. **The data already exists** — do not touch the
model or the op log:

- `Category.color` is `z.string().nullable()` in `src/core/model/category.ts`; `createCategory` and
  `updateCategory` already carry it (`updateCategory` takes a full `Category` row).
- The presentational scheme is `src/features/category-color.ts` `categoryDotColor(id)`. §10.1 wants
  **`categoryColor(category) = category.color ?? categoryDotColor(category.id)`** — a new helper that
  prefers a stored colour and falls back to the deterministic hue. **12 files call `categoryDotColor(id)`
  today** (grep: ledger, inbox, categories, recurring, plan, quick-add, both reports files, chart-ui,
  dashboard-widgets, widgets, edit-sheet). They pass an **id**, but the override needs the **category**
  — so either thread the category through, or add a lookup `(id) => color ?? auto(id)` fed by the
  categories list at each call site. Decide one approach and hold it; a second swatch scheme is exactly
  what §12.2 forbids.
- **The UI:** §12.4-a puts per-item edits behind the `⋯` menu → "Set colour" → a `Popover` palette +
  an "Auto" reset. `CategoriesView` already has the row `⋯` menu (`RowActions`) and a `BudgetSheet`
  precedent. Read `CategorySheet.tsx` / `CategoriesView.tsx` first. The palette swatches should be a
  fixed, legible set (pick from the same oklch discipline as the ramp) — **run the contrast intuition,
  and remember `theme.test.ts` guards the token ramp, not arbitrary category colours** (a user-chosen
  dot sits on `--card`, so keep the set readable there in both themes).

### Strand 2 — empty / loading / error / sync states (§12.6)

- **Skeletons, not "Loading…".** `FigureSkeleton`/`ListSkeleton` exist and Ledger/Plan/Dashboard already
  use them. **Five list views still render a plain `<p>Loading…`** on `!ready`: `ContainersView`,
  `CategoriesView`, `GoalsView`, `RecurringView`, `InboxView`. Give each a skeleton in its own shape.
- **Empty states as invitations.** `EmptyState` (icon + title + line + action) is used in 8 places; the
  list views already distinguish "nothing here yet" from "nothing matches those filters". Sweep for any
  hand-rolled empty `<div>`s that slipped through, and add **first-run onboarding when there are no
  categories at all** (the app is unusable until one exists — §12.6 says invite, don't shrug).
- **Sync + `DriveError` surfaces.** `SyncIndicator.tsx` already has a spinner / muted cloud / struck
  cloud + a Reconnect pill, and `describeSyncError` lives in `src/sync/drive.ts`. This phase adds the
  **persistent-error banner** (a sync that keeps failing is currently only a small header glyph) and
  considers a first-run "not connected yet" state. `lastSyncErrorAtom` is in `store.ts`. Do NOT re-open
  the M9 sync mechanism — this is surfacing, not plumbing.
- **`src/app/error.tsx` + `global-error.tsx`** (Phase 2) already exist in §12 voice — leave them; this
  strand is about the *in-view* states, not the route boundaries.

### Strand 3 — the accessibility pass

- **Visible iris focus rings** on every interactive control; **`aria-label` on every icon-only control**
  (the FAB, `RowActions`, sync glyph, sort select, chart toggles). Grep `size="icon"` and bare
  `<button>`s.
- **Contrast** — the new ramp is already held to WCAG AA by `theme.test.ts`; extend the intuition to any
  new colour this phase introduces (the category palette).
- **Reduced motion** is a global kill-switch already (§12.5, `globals.css`) — verify nothing added since
  bypasses it.
- **Keyboard reachability** of the FAB, the sheets, the ⌘K palette, the More sheet, and the new dashboard
  drill-down links (they are real `<Link>`s / `<a>`s now, so they should already tab).
- **Landmarks** on the tab bar / sidebar rail (`nav`), `main`, etc.

### Compose it, don't fork it

`src/features/ui/` is the language: `EmptyState`, `ListSkeleton`/`FigureSkeleton`, `RowActions`,
`PageHeader`, `Money`, `Figure`, `Eyebrow`, `Marginalia`, and shadcn `popover`/`collapsible`. Hand-rolling
one of these in Tailwind is forking §12.8. `useLocalPref` is `T extends string` (a boolean needs
`"open"|"closed"`); the repo's ESLint forbids `setState` in an effect — use lazy `useState`,
`useSyncExternalStore`, or a jotai setter.

Phases 9 (Playwright e2e) and 10 (docs) are specified in `M11-PLAN.md`; don't re-plan them, but re-ground
each in the code before starting.

**Owed to Phase 10 (docs), noted so it isn't lost:**
- §12.4 has no paragraph on the **navigation shell** (bottom tabs vs. rail, the More sheet,
  iris-marks-the-active-tab), nor on the **dashboard as a widget registry** (fold, per-widget window,
  the drill-down deep links). Phases 4 and 7 invented no new *device*, so nothing is out of compliance —
  but both should be described.
- §12.4's carried-day-header paragraph should note the **`overflow-clip`** requirement, since the next
  person to add a sticky header inside a card will hit the same wall.
- §6.1's **per-widget period override** and period **persistence** are now built (Phase 7) — the spec
  describes them as intended; confirm the wording matches what shipped.
- `HANDOFF.md`'s §12 cheat-sheet (invariant #8) still describes the M2 language. Its banner flags this,
  but Phase 10 should rewrite the cheat-sheet itself.

---

## 6. Environment & verify

**WSL2, `/home/may/github/yaccount`. Node v22.18.0 via nvm — PREFIX EVERY npm/npx CALL:**

```bash
export PATH="/home/may/.nvm/versions/node/v22.18.0/bin:$PATH"
cd /home/may/github/yaccount
npm test          # vitest — 788 passing at end of Phase 7
npm run typecheck # tsc --noEmit
npm run lint      # eslint .
npm run build     # next build → static out/
npx prettier --check src
npm run dev       # a dev server may ALREADY be running on :3000 — check before starting another
```

- **Test counts:** 407 (M9) → 441 (P1) → 456 (P1.5) → 494 (P2) → 573 (P3) → 608 (P4) → 659 (P5) →
  715 (P6) → **788 (P7)** (+73: 60 engine derivations, 13 deep-link/period-pref/registry/sankey-layout).
- **A dev server was left running on http://localhost:3000** (PID may differ). `curl -s -o /dev/null -w
  "%{http_code}" http://localhost:3000/ledger` to check before launching a second one.
- **Pre-existing prettier drift** on `src/components/ui/checkbox.tsx`, `progress.tsx`,
  `src/core/engine/recurring.test.ts`, `src/core/model/goal.test.ts`,
  `src/core/model/recurringRule.test.ts`. It predates M11 — **verified on `main`**. Don't reformat them
  as part of an unrelated commit; it pollutes the diff. Run
  `npx prettier --write` only on paths you actually touched.
- Timezone of this machine is **EDT (UTC-4)**; several date bugs only show up after 20:00 local.

---

## 7. Decisions from the user

**Answered — treat as locked:**

- **Bottom tabs = Home · Ledger · Inbox · More** (2026-07-22). Inbox takes the third slot, not Plan;
  the pending badge sits on the Inbox tab. Plan/Goals/Recurring/Containers/Categories/Settings go in
  the More sheet. See §2.
- **Design direction = A, "The Standing Register."** Chosen from three illustrated options.
- **Entry time is stored, displayed AND user-editable** (drove Phase 1.5).
- **`loglevel`, `react-error-boundary`, `@playwright/test`** are acceptable dependencies.

- **Routes stay stable** (2026-07-22). `/` = dashboard, `/ledger` = ledger, on every breakpoint. The
  app does NOT open to a different screen on mobile.
- **Dashboard widgets: fixed order + collapsible sections** for M11 (2026-07-22). Collapse state
  persists (localStorage, keyed by widget id).

**Settled inside Phase 4 (not user decisions, but don't silently undo them):**

- **Settings is no longer a header gear.** Desktop: the rail's footer. Phone: the More sheet. The
  phone header carries identity and status only — there is no room for a fourth control.
- **Shortcuts live only in the quick-add sheet.** That was the declutter ask; do not put the strip back
  on the ledger.
- **The FAB is on every breakpoint,** not just mobile — the dashboard has no compose bar, and ⌘K's
  "log an expense" needs a visible home.

**Settled inside Phase 5 (user feedback during its browser test — don't silently undo these):**

- **The ledger has NO compose bar.** The FAB + quick-add sheet are how you write, from every screen.
  `ledger/ComposeBar.tsx` is deleted. The §12.4 compose-bar pattern still governs Categories and
  Containers.
- **Shortcut chips are two-line cards** (name, then amount), not long pills.
- **A row in a filter popover is clickable to its edges** — if it highlights on hover it must respond
  to a press there.
- **Press feedback is a colour, not a scale.** §12.5's motion budget has no transform in it; the user
  accepted this when it was flagged.

**Settled inside Phase 6 (user feedback during its browser test — don't silently undo these):**

- **CREATING ANYTHING OPENS A SHEET. The inline compose bar is retired** (2026-07-22, the user's
  explicit decision after using both). `ResponsiveSheet` off a `PageHeader` **New** action, or the FAB
  for a transaction. **§12.4 was edited to say so** — this is the current law, not a deviation. Do not
  rebuild a compose bar anywhere. `border-primary/15 bg-primary/[0.04]` appears nowhere in `src/`.
- **Rename stays inline** (§12.4-a, ✓/✗, blur never commits) — that exception was not revisited.
- **A page's New action sits on the eyebrow's line, not the title's** (`PageHeader`). It was crammed
  beside a fluid serif title at 390px.
- **A container's counted choice is made when you create it**, as a segmented pair, **defaulting to Not
  counted** — §5.7's opt-in model is untouched; only the visibility of the choice changed.
- **Every field on a create sheet is: label → segmented pair → one line of meaning**, with the default
  option leftmost. A checkbox-plus-sentence was rejected as the odd control out.
- **Archived/paused sections are closed by default**, count visible in the header.

**Nothing is currently open.** If something genuinely needs a decision, ask ONE question at a time —
never batch them (a standing user preference).

### Post-M11 roadmap (user-stated, do NOT build in M11)

- **A real widget system** — the user intends a dashboard where widgets can be moved around freely.
  Not M11 scope, but **Phase 7 must not make it a rewrite**: build each widget as a self-contained
  entry in a registry (`{ id, title, defaultVisible, render }`) that the dashboard maps over, rather
  than a hand-laid JSX blob. Use those same stable ids as the collapse-state keys, so the future
  reorder/visibility layer is a wrapper over an existing list instead of a teardown. Per-widget
  `ErrorBoundary` and per-widget period override (§6.1) fall out of the same shape.

---

## 8. Conventions that bit us — don't relearn these the hard way

- **shadcn/ui first**, Lucide icons, semantic tokens only, amounts `font-mono` + `.tnum`, headers
  Fraunces. Add components with `npx shadcn@latest add <name>` (PATH prefix first).
- **`shadcn add` prompts and will hang on a non-TTY** when a component it depends on already exists
  ("overwrite button.tsx?"). Pipe answers in: `yes n | npx shadcn@latest add <name>`. Then check
  `git status` — the CLI can rewrite `globals.css`, and the M11 token ramp lives there.
- **`overflow-hidden` BREAKS `position: sticky` inside it.** `overflow: hidden` establishes a scroll
  container, so a sticky child sticks to that box — which never scrolls — instead of the viewport. Use
  **`overflow-clip`**: it clips to the rounded corners and creates no scroll container. This bit the
  carried day header in Phase 5. Only the ledger's register card was changed; change another card only
  when it gains a sticky child.
- **Don't wrap a `<label>` around a Radix control.** `Checkbox`/`RadioGroup` render a `<button>`, and a
  label containing its own control leaves "did that click toggle once or twice" to the browser. Use
  `<Label htmlFor>` as a SIBLING — and make the label the full row (`w-full` + its own padding, control
  positioned over it) so the whole hover area is pressable. A row that highlights but doesn't respond
  at its edges was a real complaint in Phase 5.
- **Tailwind arbitrary values: `calc()` needs whitespace around `+`/`-`, written as underscores** —
  `bottom-[calc(4.25rem_+_env(safe-area-inset-bottom))]`. Without them the declaration is invalid and
  is dropped silently, so the element just loses that property (this bit the FAB in Phase 4).
- **`Input` carries `text-base md:text-sm`.** `tailwind-merge` drops the conflicting `text-base` when
  you pass a size, but `md:text-sm` is a different variant group and survives — pass both
  (`text-4xl md:text-4xl`) or the field shrinks on a desktop.
- **`:hover` does not exist on a phone.** Anything hidden behind `group-hover:` is *unreachable* on
  touch, not merely subtle — this cost every list view its row actions until Phase 6. Scope the hiding
  with `pointer-coarse:opacity-100` (Tailwind 4.3 ships the variant; the media block emits after the
  plain utility, so it wins). Better: use **`RowActions`** and don't restate the class list at all.
- **`useLocalPref` is `T extends string`.** A boolean preference needs `"open"|"closed"` or a typed
  wrapper — and never a `useState` + effect, which this repo's ESLint forbids.
- **Do the 390px arithmetic before calling a row "a bit tight".** Two real overflows shipped through
  Phase 5 unnoticed: a 440px selection bar in a 350px column, and an inbox row leaving 20px for the
  payee. Content width at 390 is **350px** (`main` carries `px-5`); count the fixed children and the
  gaps.
- **A sticky element inside the reading column clears the top bar at `top-16`**, not `top-0` —
  `TopBar` is `sticky top-0 h-14 z-30`, so use `z-20` beneath it.
- **`src/core/` is pure TS** — ESLint blocks React/Next/Capacitor/drivestore imports there. All new
  derivations go in `src/core/engine/` as pure functions taking `today` as an argument.
- **A pure predicate over a view's own rows belongs in `src/features/<view>/filter.ts`, not
  `src/core/engine/`** — it needs view-computed context (a goal's progress, a category's budget today)
  and it is a presentation decision. Precedent: `ledger/amount.ts`, `ledger/compose.ts`, `clock.ts`,
  `unique-name.ts`, `prefs.ts` are all pure and tested under `src/features/`.
- **`react-hooks/set-state-in-effect` is enforced.** Use lazy `useState` initializers,
  `useSyncExternalStore`, or an async/deferred callback — never a sync `setState` in an effect body.
- **`verbatimModuleSyntax: true`** → `import type` for type-only imports.
- Adding a required field to a zod table schema breaks literal fixtures — grep for them
  (`schemas.test.ts` is usually the only one; everything else builds via model factories).
- **Never** run `npx prettier --write` across the whole repo; it rewrites pre-existing drift into your
  diff. (Happened once in Phase 1; reverted.)
- `crypto.randomUUID()` and IndexedDB are browser-only — UI is manual-verify until Playwright (Phase 9).
- Commit messages: extremely concise in style but explain the WHY. **No co-author / Claude mentions.**
- Use the `gh` CLI for GitHub.

---

## 9. Git state

```
branch: m11-design-polish  (pushed, tracking origin/m11-design-polish — 22 ahead of main)

cfe1bfb fix: pin the filter Clear button, always in reach beside the rail      (Phase 7 fix 3)
7de2c5f fix: seed the ledger's deep-link filter from useSearchParams, not window  (Phase 7 fix 2)
432a770 feat: dashboard drill-downs, and two layout fixes                       (Phase 7 fix 1)
bff1dc8 feat: dashboard v2 — a widget registry, and nine derivations to fill it (Phase 7)
d632bf9 docs: Phase 6 passed its browser test; hand off Phase 7
7372a80 fix: the counted choice is a segmented pair, like every other field   (Phase 6 fix 3)
b0483b4 feat: choose whether a container counts, at the moment you make it    (Phase 6 fix 2)
3683b74 fix: one create surface everywhere, and a header that fits a phone    (Phase 6 fix 1)
acf8f26 feat: filters and mobile density on the other five list views    (Phase 6)
63ab6cd docs: Phase 5 passed its browser test; hand off Phase 6
afaa8de fix: ledger v2 follow-ups from browser testing                   (Phase 5 fixes)
14650d7 feat: ledger v2 — the figure on its history, the carried balance, filters  (Phase 5)
f754444 docs: Phase 4 passed its browser test; hand off Phase 5
2e4d6cc feat: mobile shell — tab bar, sidebar rail, quick-add FAB, ⌘K    (Phase 4)
6fb7df0 docs: Phase 3 passed its browser test; flag the stale §12 cheat-sheet
7b5a4c2 feat: design system v2 — tinted paper, the figure scale, the rule (Phase 3)
22770b4 docs: close the last two open questions; note the post-M11 widget system
c43bd66 docs: lock the bottom-tab slots — Inbox replaces Plan
bc6d26a docs: M11 live handoff for a fresh context window
97228ca feat: surface and log failures instead of swallowing them        (Phase 2)
96be47a feat: make an entry's time editable, not just its date           (Phase 1.5)
02d72a5 fix: order the ledger by when entries were written, not by a random UUID  (Phase 1)
381d34c docs: M9 merged (PR #8), handoff prepped for M11 (M10 skipped)   ← main
```

No PR opened yet — the user has been merging at milestone boundaries via `gh`. Open one when M11 is
complete (Phase 10), not per phase.
