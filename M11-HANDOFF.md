# M11 — Design System & Polish — LIVE HANDOFF

> **You are picking this up mid-milestone. Read this file first, then `M11-PLAN.md` (the approved plan).**
> **Branch:** `m11-design-polish` (pushed to origin, 8 commits ahead of `main`).
> **Status:** Phases 1, 1.5, 2, 3 and 4 of 10 are DONE, **user browser-tested and passed**, committed
> and pushed. **Phase 5 is next.**
> **Last updated:** 2026-07-22, after Phase 4 passed its browser test.

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
| 5 | Ledger v2 (history curve, carried balance, filters/sort) | ⬜ **NEXT** |
| 6 | Filters + mobile density on the other 5 list views | ⬜ |
| 7 | Dashboard v2 (KPIs, pace, Sankey, calendar, payees, upcoming) | ⬜ |
| 8 | Category colours, empty/loading/error states, a11y | ⬜ |
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

---

## 5. Phase 5 — what to do next

From `M11-PLAN.md` §6 (plus the engine slice in §2 that it consumes). **Re-ground it in the code before
you start; do not work from this summary.**

- **The hero curve.** `Figure` (`src/features/ui/Figure.tsx`) **already takes a `series` prop** and
  renders the area curve under the number — Phase 5 supplies the data, it does not build the component.
  Needs new pure engine functions in `core/engine/balances.ts`: `overallBalanceAsOf(txns, containers,
  iso)` and `overallBalanceSeries(txns, containers, days[])` (one ordered pass), reusing the §5.7
  counted-container rule already in `overallBalance`. **Neither exists yet.**
- **The carried balance** (§12.4, M11): the sticky day header prints the running overall balance as of
  that day, with dot leaders. **Hidden whenever a filter is active** — a filtered list's rows no longer
  explain the number, and a balance you can't reconcile is worse than none. The day header is already
  an `Eyebrow` on `--surface-sunken`; it is not sticky yet.
- **`core/engine/filter.ts` (new, pure, TDD):** `TransactionFilter` + `matchesFilter` / `applyFilter`
  (text, category ids, container ids, kind expense|income|transfer, date range, amount range) so every
  list view in Phase 6 shares one predicate. `searchTransactions` (Phase 4) is the text half of this —
  fold it in rather than growing a second matcher.
- **`src/features/FilterBar.tsx`:** search field + h-scrolling chip filters (Popover + checkbox
  multi-select) + sort control + active count + Clear. **Filters are NOT persisted** (a hidden active
  filter is a trap); the sort preference IS. Sort: newest / oldest / largest / smallest.
- shadcn adds likely needed: `popover` (`checkbox` and `scroll-area`-free alternatives already exist —
  `checkbox.tsx` is present). Run `npx shadcn add` with `yes n |` piped in so it declines overwriting
  `button.tsx`/`input.tsx`, and check `git status` afterwards for an unwanted `globals.css` rewrite.
- Row press states / `active:` scale on touch. The just-logged iris wash **already shipped in Phase 4**
  (`flashRowAtom` + `LedgerRow`'s `flashed` prop) — don't rebuild it.

**Phase 4 is user-testable as:** the tab bar at 390×844, More sheet, FAB → quick-add → the row landing
with its wash, shortcuts only in the sheet now, the rail at ≥1024px, ⌘K.

Phases 5–10 are specified in `M11-PLAN.md`; don't re-plan them, but do re-ground each in the code
before starting it.

**Owed to Phase 10 (docs), noted so it isn't lost:** §12.4 has no paragraph on the navigation shell
(bottom tabs vs. rail, the More sheet, iris-marks-the-active-tab). Phase 4 followed §12.2/§12.5 as
written and invented no new device, so nothing is out of compliance — but the shell itself should be
described in §12.4 when the docs phase runs.

---

## 6. Environment & verify

**WSL2, `/home/may/github/yaccount`. Node v22.18.0 via nvm — PREFIX EVERY npm/npx CALL:**

```bash
export PATH="/home/may/.nvm/versions/node/v22.18.0/bin:$PATH"
cd /home/may/github/yaccount
npm test          # vitest — 494 passing at end of Phase 2
npm run typecheck # tsc --noEmit
npm run lint      # eslint .
npm run build     # next build → static out/
npx prettier --check src
npm run dev       # a dev server may ALREADY be running on :3000 — check before starting another
```

- **Test counts:** 407 (M9) → 441 (P1) → 456 (P1.5) → 494 (P2) → 573 (P3) → **608 (P4)**.
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
  on the ledger in Phase 5.
- **The FAB is on every breakpoint,** not just mobile — the dashboard has no compose bar, and ⌘K's
  "log an expense" needs a visible home.

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
- **Tailwind arbitrary values: `calc()` needs whitespace around `+`/`-`, written as underscores** —
  `bottom-[calc(4.25rem_+_env(safe-area-inset-bottom))]`. Without them the declaration is invalid and
  is dropped silently, so the element just loses that property (this bit the FAB in Phase 4).
- **`Input` carries `text-base md:text-sm`.** `tailwind-merge` drops the conflicting `text-base` when
  you pass a size, but `md:text-sm` is a different variant group and survives — pass both
  (`text-4xl md:text-4xl`) or the field shrinks on a desktop.
- **`src/core/` is pure TS** — ESLint blocks React/Next/Capacitor/drivestore imports there. All new
  derivations go in `src/core/engine/` as pure functions taking `today` as an argument.
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
branch: m11-design-polish  (pushed, tracking origin/m11-design-polish)

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
