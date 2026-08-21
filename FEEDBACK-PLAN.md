# yaccount — feedback remediation plan

**Audience: an implementing agent starting in a fresh context window.** Read
[§0](#0--read-this-before-you-touch-anything) and [§1](#1--the-loop-you-must-follow) in full,
then start at the lowest stage in [§3](#3--progress-log) that is not yet merged.

Six pieces of user feedback, traced to lines and ordered by how much of the app each breaks —
not by the order they were reported. Stages 4–6 are independent of everything above them; if you
want an early win, take Stage 4 first (about an hour).

| # | Stage | Branch | Cost |
|---|---|---|---|
| 1 | [Row menus stop eating scrolls](#stage-1--row-menus-stop-eating-scrolls) | `fix/row-menu-scroll` | ~1 file · half a day |
| 2 | [Taps register the first time](#stage-2--taps-register-the-first-time) | `fix/touch-responsiveness` | measure first · 1–2 days |
| 3 | [The sheet stops being elastic](#stage-3--the-sheet-stops-being-elastic) | `fix/sheet-keyboard` | net −80 lines · 2 days |
| 4 | [Reopened goals return to the active list](#stage-4--reopened-goals-return-to-the-active-list) | `fix/goal-reopen-on-edit` | ~15 lines · 1 hour |
| 5 | [Investments report the truth](#stage-5--investments-report-the-truth) | `fix/investment-report-window` | 1 widget · 1 day |
| 6 | [Hide categories from stats](#stage-6--hide-categories-from-stats) | `feat/hide-categories-from-stats` | schema + UI · 1 day |

---

## 0 · Read this before you touch anything

### Orientation

- Product rules: [`yaccount-tech-spec-v3.md`](yaccount-tech-spec-v3.md). Architecture and
  conventions: [`yaccount-implementation-details.md`](yaccount-implementation-details.md).
  Operational state and hazards: [`HANDOFF.md`](HANDOFF.md). Read `HANDOFF.md`'s **Hazards**
  section before running anything.
- Working rules: [`AGENTS.md`](AGENTS.md). It mandates TDD; §1 below is that rule made concrete.

### Environment

- **WSL:** PATH interop leaks the Windows `node.exe`/`npm`, which produces `.bin` shims with no
  exec bit (`next: Permission denied`). Prefix every `npm`/`npx` call with the WSL Node bin on
  `PATH`. If an install ever ran under Windows npm, wipe `node_modules` and `package-lock.json`
  and reinstall with WSL npm.
- **`.env` is gitignored and absent from a fresh clone.** Without
  `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID` the auth provider throws, the whole shell fails to render,
  and every Playwright test dies at the first `page.goto`. Confirm it exists before you run e2e.
- **Stop `npm run dev` before running Playwright.** Next refuses a second dev server for the same
  directory, even on another port.
- **Never loop e2e runs back-to-back.** Playwright tears its dev server down as the next run
  starts, `reuseExistingServer` attaches to the dying one, and ~33 of 47 tests fail at once. Wait
  for port 3100 to clear. That mass failure is a measurement artifact and it has cost real time
  twice.
- **Leave `workers: 4` in `playwright.config.ts` alone.** It is pinned deliberately; raising it
  reintroduces flakes.
- **Prettier:** never `--write` the whole repo. CRLF checkouts make `--check .` flag nearly every
  file. Check only files you touched, with `--end-of-line auto`.

### What "testable" means in this repo

`vitest.config.ts` sets `environment: "node"`. **There is no jsdom** — no `render()`, no
`fireEvent`, no `@testing-library`. Every test you write must be one of these four kinds. Each
cycle below names which kind it is.

- **`pure`** — a `.ts` function with no DOM. The strongest kind. `fab-hold.ts`, `filter.ts`,
  `goals.ts` are the precedent, and the reason the fixes below deliberately push decisions out of
  components and into pure functions.
- **`tree`** — call the component as a function, inspect the returned element's `.props`. See
  `src/features/settings/BlockingOperationOverlay.test.tsx` for the exact idiom.
- **`source`** — `readFileSync` the file, assert a string is present or absent. Weak, but it is
  how `src/features/ui/ios-interactions.test.ts` stops abandoned approaches coming back. Use it
  only as a regression fence, never as the primary test for behaviour.
- **`e2e`** — Playwright, `e2e/critical-flows.spec.ts`. Already emulates touch.

---

## 1 · The loop you must follow

**Every behaviour change in this document goes through this loop. No exceptions inside a stage.**
Each cycle below is labelled `RED → GREEN`. Do them one at a time, in order.

1. **RED.** Write the test named in the cycle. Nothing else. Do not write, stub, or sketch the
   implementation first.
2. **Run it. Confirm it fails, and confirm it fails for the _right reason_.** This step is not
   ceremony — it is the only thing separating TDD from writing tests afterwards. Each cycle states
   the failure you should see. If you see a *different* failure — a typo in the test, a bad
   import, a missing mock, `undefined is not a function` where you expected an assertion
   mismatch — **fix the test and re-run until the failure is the stated one.** A test that passes
   immediately is a broken test; find out why before continuing.
3. **GREEN.** Write the *minimum* implementation that makes it pass. Not the design you have in
   your head — the minimum.
4. **Run the full suite** (`npm test`), not just the new file. Fix anything you broke.
5. **Refactor** if needed, with the tests green the whole way.
6. **Commit.** One commit per cycle is fine; one per logical group is fine. Terse, imperative,
   sentence case, no co-author or assistant mentions.

**Never edit an existing test to make failing code pass.** If a test in this repo now seems wrong,
stop and say so in the PR description rather than changing it quietly — the four
`not.toContain` guards in `ios-interactions.test.ts` are the one place where a *deliberate*
rewrite is called for, and Stage 3 handles that explicitly as its own cycle.

### Where TDD does not apply

`AGENTS.md` exempts formatting, comments, docs, config and dependency bumps, and renames. Two more
things in this plan are genuinely untestable, and both are marked **`NO-TDD`** where they appear:

- **Stage 2 step 0** and **Stage 3 step 0** are *measurements on a physical device*. They produce
  numbers, not behaviour.
- **Device verification matrices** at the end of Stages 2 and 3.

When you hit a `NO-TDD` step, say so out loud in your report before proceeding, per `AGENTS.md`.
Do not invent a test to satisfy the rule — a test that asserts a mock behaves like your mock
proves nothing, and Stage 3 spells out exactly where that trap is.

---

## 2 · Branch and PR protocol

**One stage = one branch = one PR. Never combine two stages.**

```bash
# Always start from freshly pulled main. Never build on the previous stage's branch.
git checkout main && git pull
git checkout -b fix/row-menu-scroll        # the branch named in the stage heading
```

Branch names are given per stage and follow the repo's existing `fix/…` / `feat/…` convention
(`fix/e2e-worker-contention`, `feat/reorder-dashboard-widgets`).

Before opening the PR, run the **full gate** — all five, in this order:

```bash
npm test && npm run typecheck && npm run lint && npm run build && npm run test:e2e
```

Then:

```bash
gh pr create --base main \
  --title "Fix row menus opening on scroll" \
  --body "..."
```

The PR body must state: what broke, the root cause with `file:line`, the cycles you ran, and
**anything you could not test and why**. If a stage's unresolved question ([§4](#4--unresolved))
was answered, record the answer in the PR body — that is where the decision lives.

Wait for the PR to be merged before starting the next stage. Then update
[§3](#3--progress-log) in a follow-up commit on the next stage's branch.

---

## Stage 1 · Row menus stop eating scrolls

**Branch:** `fix/row-menu-scroll` · **Breaks reading** · Root cause confirmed

### The bug

Radix's `DropdownMenuTrigger` opens on **pointerdown**, not click, and calls `preventDefault()`
while doing it — which cancels the browser's scroll gesture outright:

```js
// node_modules/@radix-ui/react-dropdown-menu/dist/index.mjs:77
onPointerDown: composeEventHandlers(props.onPointerDown, (event) => {
  if (!disabled && event.button === 0 && event.ctrlKey === false) {
    context.onOpenToggle();
    if (!context.open) event.preventDefault();
  }
}),
```

The `⋯` sits at the right edge of every ledger row, stacked down the side of the list — exactly
where a right thumb lands. Put a thumb down to scroll and the menu opens instead.

Ten call sites, split between `RowActions` and raw `DropdownMenuTrigger`. `composeEventHandlers`
checks `defaultPrevented`, so *our* handler calling `preventDefault()` suppresses Radix's — that
is the seam the fix uses.

### Cycle 1.1 — the tap/drag state machine `pure`

**RED.** Create `src/features/ui/tap-open.test.ts`. Model it on
`src/features/shell/fab-hold.test.ts`. Assert:

- `startTap(10, 20)` returns a pending state.
- `moveTap(state, 13, 22)` — a 3px move — stays pending.
- `moveTap(state, 10, 32)` — an 11px move — returns cancelled.
- `endTap(pending)` returns `"open"`.
- `endTap(cancelled)` returns `null`.
- A cancelled state fed back through `moveTap` stays cancelled — it can never re-open.

**Expected failure:** `Cannot find module '@/features/ui/tap-open'`. That is the right reason for
a new module. If instead you see a syntax or alias error, fix the test first.

**GREEN.** Create `src/features/ui/tap-open.ts` with a 10px threshold constant. Pure — no DOM, no
React, no timers.

### Cycle 1.2 — `RowActions` opens on tap, not pointerdown `tree`

**RED.** Add `src/features/ui/RowActions.test.tsx`. Call `RowActions({ label, children })` as a
function and walk the returned tree. Assert:

- The root `DropdownMenu` element receives a controlled `open` prop and an `onOpenChange`
  (today it receives neither — it is uncontrolled).
- The trigger's `Button` props include an `onPointerDown`, and invoking it with a stub event
  calls that event's `preventDefault`.
- The trigger carries `touch-action: pan-y` (via `style` or a `touch-pan-y` class).

**Expected failure:** the `open` assertion fails with `undefined`, because `RowActions` currently
renders an uncontrolled `DropdownMenu`.

**GREEN.** Convert `RowActions` to a controlled `DropdownMenu` driven by `useState` plus
`tap-open.ts`: `onPointerDown` preventDefaults, records the start point, and focuses the button;
`onPointerMove` feeds `moveTap`; `onPointerUp` opens only if `endTap` returns `"open"`.

### Cycle 1.3 — no site can bypass the fix `source`

**RED.** Add to `src/features/ui/ios-interactions.test.ts` (or a sibling): read every file under
`src/features` and assert none imports `DropdownMenuTrigger` from `@/components/ui/dropdown-menu`.

**Expected failure:** four files listed — `GoalsView.tsx`, `BudgetSheet.tsx`,
`LogBalanceSheet.tsx`, `AuthButton.tsx`.

**GREEN.** Migrate those four onto `RowActions`. They are all already `⋯`-shaped, so this is a
swap, not a redesign. This is the guard that stops site eleven regressing.

### Cycle 1.4 — the gesture actually works `e2e`

**RED.** In `e2e/critical-flows.spec.ts`, in the touch project: seed enough ledger rows to scroll,
then `page.touchscreen` drag starting **on a row's `⋯` button**. Assert the page scrolled *and*
no menu is open. Second case: a stationary tap on the same button opens the menu.

**Expected failure:** the drag case — the menu is open and `scrollY` is unchanged.

**GREEN.** Should already pass from 1.2. If it does not, the pointer capture or the threshold is
wrong; fix the implementation, not the test.

### Gate and PR

Run the full five-command gate. PR title: `Fix row menus opening on scroll`.

**Done when** a thumb-drag starting on the `⋯` scrolls the register, and a tap on it still opens
the menu on the first try.

> Out of scope: moving the `⋯` off the right edge is a design change, not a bug fix. See Q7 —
> do not do it in this stage.

---

## Stage 2 · Taps register the first time

**Branch:** `fix/touch-responsiveness` · **Breaks navigation** · Measure before fixing

### The bug

Three separate things; the first two both produce the reported symptom.

| Symptom | Candidate cause | Confidence |
|---|---|---|
| Nav taps ignored for ~2s after landing on Home | `/` mounts ~12 widgets synchronously, several driving statically-imported Recharts, over the whole transaction list. Main thread busy, tap dropped. | High |
| Taps "need two presses" | Static-export route transitions show **no pending state at all**. First tap starts an RSC fetch, nothing on screen changes, user taps again. `useLinkStatus` exists in Next 16.2 and is unused. | High |
| A circle around the FAB on first press | `QuickAddFab.tsx` calls `event.currentTarget.focus()` inside `onPointerDown`, and the button carries `focus-visible:ring-2 ring-offset-2`. WebKit matches `:focus-visible` on programmatic focus — so the ring shows on the first tap only, because after that the button is already focused. | Confirmed |

### Step 2.0 — measure `NO-TDD`

Say out loud that this step is untestable, then do it.

Add a temporary `PerformanceObserver({ type: "longtask" })` and log every task over 50ms during a
cold load of `/` plus a tab switch. **On a real phone, not desktop.** Record the numbers in the PR
body. They are this stage's acceptance criterion and they decide how far 2.4 needs to go.

Remove the instrumentation before opening the PR.

### Cycle 2.1 — the FAB does not focus on touch `tree`

**RED.** In a new `src/features/shell/QuickAddFab.test.tsx`, call the component, pull the button's
`onPointerDown`, and invoke it twice with stub events carrying a `currentTarget` whose `focus` is
a `vi.fn()`: once with `pointerType: "touch"`, once with `"mouse"`. Assert `focus` was **not**
called for touch and **was** called for mouse.

**Expected failure:** the touch case — `focus` was called once.

**GREEN.** Guard the `focus()` call on `event.pointerType === "mouse"`. The keyboard hold path
focuses separately, so nothing else depends on it.

**Then run the existing FAB e2e tests** (`separates FAB quick press, hold chooser, and movement
cancellation`, `keeps FAB geometry…`, `opens the FAB chooser from a touch hold`). You are editing
a state machine that already has hard-won coverage; if any of them break, you have changed
behaviour beyond the ring.

### Cycle 2.2 — the pressed tab lights up immediately `pure` + `source`

`useLinkStatus` is a hook, so it cannot be called outside a render — which means the *decision*
has to move into a pure function to be testable. Do that first.

**RED.** Add `src/features/shell/nav.test.ts` cases for a new
`tabSlotState({ current, pending })` returning `"active" | "pending" | "idle"`, and assert
`pending` wins over `idle` but `current` wins over `pending`.

**Expected failure:** `tabSlotState is not a function`.

**GREEN.** Add it to `src/features/shell/nav.ts`, then wire `useLinkStatus()` into the
`BottomTabBar` slot and feed its `pending` into `tabSlotState`.

**RED (fence).** `source`-assert `BottomTabBar.tsx` contains `useLinkStatus`.

This does not make navigation faster. It removes the reason to double-tap, and it is cheap enough
to ship regardless of what 2.0 found.

### Cycle 2.3 — off-screen widgets stop costing layout `source`

**RED.** Assert `WidgetShell.tsx` sets `content-visibility` and a `contain-intrinsic-size` on the
widget panel.

**Expected failure:** neither string present.

**GREEN.** Add them, sizing `contain-intrinsic-size` to the panel's collapsed height.

If the 2.0 trace still shows long tasks after this, escalate — mount below-the-fold widget bodies
behind an `IntersectionObserver`, and pull the Recharts-backed widgets behind `next/dynamic` so
they leave the initial chunk. Each escalation gets its own RED→GREEN cycle; do not batch them.

### Cycle 2.4 — the complaint, as a test `e2e`

**RED.** Navigate to `/`, then tap the Ledger tab **with no intervening wait or
`waitForLoadState`**. Assert the URL changes.

**Expected failure:** timeout on the URL assertion — this is the user's complaint reproduced.

**GREEN.** Should pass once 2.3 lands. If not, escalate as above.

### Step 2.5 — verify on device `NO-TDD`

Re-run the 2.0 trace and compare. This is the real gate; the automated tests only fence the
regression.

### Gate and PR

Full five-command gate. PR title: `Make tab taps register on the first press`.

**Done when** a tab tap taken immediately after Home finishes loading navigates on the first
press, and no ring appears on a touch press of the FAB.

---

## Stage 3 · The sheet stops being elastic

**Branch:** `fix/sheet-keyboard` · **Every write action** · Three subagents converged

> **Blocked on Q1 and Q2.** Get answers before starting — Q2 in particular decides whether step
> 3.3 regresses a supported platform.

Three agents worked this independently — each formed its own solution before searching, then
researched, then revised. They converged on the diagnosis and disagreed on exactly two points,
both flagged below.

### The bug

1. **The sheet transcribes iOS's rubber-band into its own position.** `sheet-viewport.ts:34`
   subscribes to `visualViewport`'s *scroll* event, and `sheet-viewport.ts:22` feeds `offsetTop`
   straight into `bottom`. When WebKit pans the visual viewport to reveal the caret, the sheet
   chases the pan — and moving the sheet moves the input, which changes what WebKit wants to
   reveal. Two parties correcting the same number. Vaul, the closest prior art and itself a Radix
   Dialog fork, listens to `resize` only and never reads `offsetTop`.
2. **The rAF settle loop cannot converge.** `ResponsiveSheet.tsx:52-67` commits when two
   consecutive frames match exactly — but `visualViewport.height` is fractional on iOS and the
   comparison is exact equality on three floats. The `attempts >= 6` escape hatch is therefore the
   normal path, not the fallback, and what it commits is a stale mid-animation value. Then the
   next event restarts it. That is the staircase.
3. **`window.innerHeight` is poisoned on this exact deployment target.** In a standalone iOS PWA
   it permanently shrinks by ~60px after the first keyboard use and never recovers until
   force-quit. `ResponsiveSheet.tsx:25` reads it live and uses it as the baseline.
4. **Two layout properties per commit.** `bottom` moves the box; `maxHeight` moves the *top* edge
   and reflows the flex body, clamping the inner scroller's `scrollTop`. Content lurches in a
   different direction from the frame, in the same frame.

> **A hypothesis worth retiring.** The `transition` on `sheet.tsx:61` is not currently animating
> anything — Tailwind v4's shorthand covers neither `bottom` nor `max-height`; this was verified
> against the generated property list in `node_modules/tailwindcss/dist/lib.js`. But it **does**
> cover `translate`, which makes cycle 3.5 mandatory rather than optional.

### What the platform does not offer

All three agents checked, and "just delete the JavaScript" does not work here.
`interactive-widget=resizes-content` is still unimplemented in WebKit —
[bug 259770](https://bugs.webkit.org/show_bug.cgi?id=259770) open since 2023, nothing in Safari
26.x or the 27 beta, and MDN's compat data claiming otherwise was corrected in Feb 2026. `dvh`
does not respond to the iOS keyboard by spec. The VirtualKeyboard API is Chromium-only.
`visualViewport` remains the only channel that reports the keyboard on iOS — the app is not
fighting the platform, the platform genuinely does not have this. **Do not spend time re-deriving
this.**

### Step 3.0 — trace it on a real iPhone `NO-TDD`

Say out loud that this step is untestable, then do it. **Before changing a line.**

Attach Safari Web Inspector. Put a `MutationObserver` on the sheet's `style` attribute and log
every write with `performance.now()` alongside `visualViewport.height`. Today's build should show
3–15 discrete writes over ~500ms.

This trace does two jobs: it settles Q1 (does iOS publish intermediate samples during the keyboard
animation, or a single event at the end?), and it is the acceptance criterion for the whole stage.
Paste it into the PR body.

### Cycle 3.1 — the inset is one pure function `pure`

**RED.** Rewrite `src/features/ui/sheet-viewport.test.ts` around a new
`keyboardInset(base: number, height: number): number`. Assert:

- Keyboard down (`base === height`) → `0`.
- A 3px delta → `0` (below threshold).
- A full keyboard height → that height, rounded to an integer.
- Fractional inputs (`652.6666`) round — the assertion is `Number.isInteger(result)`.
- A negative delta clamps to `0`.

**Expected failure:** `keyboardInset is not a function`.

**GREEN.**

```ts
export function keyboardInset(base: number, height: number): number {
  const delta = Math.round(base - height);
  return delta > KEYBOARD_THRESHOLD ? delta : 0;
}
```

Rounded, so equal values compare equal and React bails out. Thresholded, so the predictive-text
bar and Safari's toolbar collapse move nothing.

### Cycle 3.2 — "zero jitter", as a unit test `pure`

**This is the cycle that would have caught the current bug. Do not skip it.**

**RED.** Take the `visualViewport.height` sample sequence you recorded in 3.0. Feed it through
`keyboardInset` and assert the **output** sequence has exactly two distinct values and exactly one
transition between them.

**Expected failure:** more than two distinct values, because the threshold or the rounding is not
yet doing its job on real data.

**GREEN.** Tune `KEYBOARD_THRESHOLD` until it holds. Vaul uses 60; that is the starting point.

### Cycle 3.3 — the baseline is immune to the PWA shrink `pure`

**RED.** Assert a `nextBaseline(prev, height)` running-maximum helper: a sheet opened while a
keyboard is already up records the shrunken height, and after dismissal the baseline recovers so
the inset returns to `0`.

**Expected failure:** `nextBaseline is not a function`.

**GREEN.** Implement it. Then in `ResponsiveSheet.tsx`: capture `visualViewport.height` at open,
hold it as a running maximum, **delete every read of `window.innerHeight` and `offsetTop`, delete
the `scroll` subscription, and delete the rAF settle loop.** Listen to `visualViewport.resize` and
nothing else.

### Cycle 3.4 — the style shape `pure`

**RED.** Assert a `sheetKeyboardStyle(inset)` returning `{ translate: "0 -Npx", "--kb": "Npx" }`
— and explicitly assert the returned object has **no** `transform` key and **no** `bottom` key.

**Expected failure:** `sheetKeyboardStyle is not a function`.

**GREEN.** Implement it and wire it into `ResponsiveSheet.tsx`. Cap height in CSS with `calc` off
`--kb` rather than writing `maxHeight` in pixels per commit.

> **`translate`, never `transform` — this is load-bearing and was verified directly.**
> tw-animate-css's `enter`/`exit` keyframes animate the `transform` property, so an inline
> `transform` would be clobbered for the entrance animation's 260ms and then snap when it ends
> with `fill-mode: none`. The separate `translate` property composes independently and is
> compositor-only. The `no transform key` assertion above exists to stop a future "simplification"
> undoing this.

### Cycle 3.5 — scope the transition `source`

**RED.** Assert `sheet.tsx` does not carry the bare `transition ` token.

**Expected failure:** it does.

**GREEN.** Scope it. Since `translate` **is** in Tailwind's transition list, leaving the blanket
`transition` would smear every keyboard move over 260ms — reintroducing exactly the elasticity
being removed. Whether the lift is then instant or a deliberate `--dur-3` glide is **Q1**; the
3.0 trace answers it.

### Cycle 3.6 — replace the stale regression fences `source`

This is the one place in the plan where rewriting existing tests is correct, because the four
`not.toContain` guards in `ios-interactions.test.ts:38-41` fence an approach this stage is
deliberately replacing. Say so in the PR body.

New assertions: `ResponsiveSheet.tsx` must not contain `offsetTop`, `innerHeight`,
`requestAnimationFrame`, or `"scroll"`.

### Cycle 3.7 — count the commits `e2e`

**Be honest about what this proves.** Playwright cannot emulate an iOS keyboard, and a test
claiming to would be testing your own mock. What it *can* prove is that the logic commits once.

**RED.** `addInitScript` a fake `window.visualViewport` (the pattern already exists at
`e2e/critical-flows.spec.ts:118`), drive a scripted burst of `resize` events, and count style
mutations with a `MutationObserver`. Assert **at most one commit per burst**, and assert a
dispatched `scroll` event changes nothing.

**Expected failure:** many commits, and the `scroll` event moves the sheet.

**GREEN.** Should pass from 3.1–3.4.

### Step 3.8 — the device matrix `NO-TDD`

Both Safari and installed-PWA modes:

1. Focus an input — one move, no bounce.
2. **Scroll the form with the keyboard up — the sheet must not move at all.** This is what the
   `scroll` listener broke.
3. Switch from the numeric amount field to a text field.
4. Close the sheet with the keyboard still up.
5. **The second and third sheet-open in the same standalone session** — where the `innerHeight`
   shrink shows. A single-open test passes and tells you nothing.
6. Rotate with the keyboard up.

### Step 3.9 — forward-compat `NO-TDD` (config)

Add `interactiveWidget: "resizes-content"` to `layout.tsx`. One line, inert on iOS, correct on
Android. Exempt from TDD as a config change.

### Gate and PR

Full five-command gate. PR title: `Stop the bottom sheet jittering with the keyboard up`.

**Done when** the 3.0 trace, re-run on device, shows **one** style commit per keyboard transition
instead of 3–15 — and the sheet reads as a single move rather than a spring.

> **Net effect:** roughly −80 lines. Four listeners become one. State commits per keyboard cycle go
> from dozens to about two. That is the answer to "we've overengineered this" — the fix is less
> code moving one composited property once.

---

## Stage 4 · Reopened goals return to the active list

**Branch:** `fix/goal-reopen-on-edit` · Correctness · ~1 hour

> **Blocked on Q6** — decide before cycle 4.1, because it changes what the test asserts.

### The bug

`GoalsView.tsx:196` rebuilds the edited goal with `status: editing.status` and
`completed_date: editing.completed_date`. So a goal that auto-completed at its old target keeps
`status: "completed"` when you raise the target, and `goalState()` — which reads status directly —
keeps it pinned under "Achieved & closed" even though it is no longer achieved.

There is no un-complete path anywhere, and `runGoalMaintenanceAtom` only runs at boot, so nothing
corrects it later either. The command layer already anticipated this: `updateGoal`'s own doc
comment calls itself *"the reopen path for a completed goal (set status active, completed_date
null)"*. Nobody wired it up.

### Cycle 4.1 — `reopenedGoal` `pure`

**RED.** Add `src/features/goals/reopen.test.ts`. Assert:

- A `completed` goal whose target is raised above contributions comes back `active` with
  `completed_date: null`.
- One still at or above target stays `completed`.
- A `cancelled` goal is untouched — cancelling is a decision, not a measurement.
- A `reserve` goal is untouched, because `isAchieved` never latches for reserves.

**Expected failure:** `Cannot find module '@/features/goals/reopen'`.

**GREEN.** Implement `reopenedGoal(next, txns)`. Mirror the shape of the existing
`renamedGoalContainer`, which `handleSubmit` already composes — return the row unchanged when
nothing applies.

### Cycle 4.2 — wire it in, and settle the other direction `pure`

**RED.** Assert that lowering an active goal's target below its contributions marks it completed
without a reload — i.e. `runGoalMaintenanceAtom`'s condition holds after an edit.

**GREEN.** Call `reopenedGoal` in `handleSubmit` before dispatching `updateGoal`, and run
`runGoalMaintenanceAtom` after a goal edit as well as at boot.

### Cycle 4.3 — the round trip `e2e`

**RED.** Extend the existing `creates a savings goal` flow: fund it to target, confirm it lands
under "Achieved & closed", edit the target upward, confirm it moves back to the active list
**without a reload**.

**Expected failure:** it stays under "Achieved & closed".

**GREEN.** Should pass from 4.1–4.2.

### Gate and PR

Full five-command gate. PR title: `Reopen a completed goal when its target is raised`.

**Done when** raising a completed goal's target moves it back to the top list immediately, and
lowering an active goal's target below its contributions closes it immediately.

---

## Stage 5 · Investments report the truth

**Branch:** `fix/investment-report-window` · Correctness · The engine is fine

> **Blocked on Q5.**

### The bug

`flows.ts` matches the spec — `netContributions`, `unrealizedGainLoss` and `reconstructedBalance`
all check out against §5.6 line by line. **Do not change the engine.** The bug is entirely in how
`Investments` (`registry.tsx:548`) wires it up.

1. **The headline numbers ignore the period.** `netContributions` and `unrealizedGainLoss` are both
   all-time, and `latestSnapshot` takes the newest snapshot regardless of the window — but the
   chart beside them is period-scoped. View "Last 3 months" and the card states an all-time
   contributed figure and today's value next to a three-month line. This is almost certainly the
   "incorrect information".
2. **The chart's months come from the wrong dates.**
   `monthKeysInRange(range, transactions.map(t => t.date))` falls back to ledger activity.
   Investments are typically reported monthly but contributed to rarely, so the chart's span is
   derived from the wrong events entirely.
3. **The chart cannot show what was asked for.** It plots balance alone, so a rise is
   indistinguishable from a deposit — the one thing you want to see, growth, is exactly what a
   single value line hides. At 72px with no axis and no baseline, and hidden altogether when the
   range covers one month (`data.length > 1`), it cannot carry the claim.
4. **Dead code.** The `?? 0` on `reconstructedBalance` is unreachable — `gl !== null` already
   guarantees a snapshot exists — but it reads as though a missing month plots at zero. Remove it
   as part of cycle 5.1.

### Cycle 5.1 — every figure agrees on one window `pure`

**RED.** Add `investmentReport(container, snapshots, txns, range)` cases to
`src/core/engine/flows.test.ts`. Assert:

- A range ending in the past values against the snapshot **in that range**, not today's.
- Contributed and value are computed at the same instant.
- `gainLoss === value - contributed` at every point on the series.

**Expected failure:** `investmentReport is not a function`.

**GREEN.** Implement it in `flows.ts` as one pure function returning the whole card's data, so the
widget stops assembling it inline.

### Cycle 5.2 — the chart's months come from the right events `pure`

**RED.** Assert a container with snapshots but **no transfers in range** still produces a series.

**Expected failure:** empty series — the current fallback reads the global transaction list.

**GREEN.** Derive month keys from that container's snapshot dates *and* transfer dates.

### Cycle 5.3 — growth is distinguishable from deposits `pure`

**RED.** Assert the report carries **two** series — value and contributed (cost basis) — and that
a month where money was added but the market did not move shows both rising together.

**Expected failure:** only one series.

**GREEN.** Add the cost-basis series. The gap between the two lines *is* the gain or loss, which
makes growth legible without a second widget. In the component, give it real height and a y-axis;
it is a chart now, not a sparkline. Render a point for a single-month range instead of nothing,
and label months before the container's first snapshot as reconstructed rather than drawing them
as confident history.

### Cycle 5.4 — the bug, as a test `e2e`

**RED.** Seed an investment container with two snapshots and one transfer. Assert the card's
stated **contributed** figure changes when the dashboard period changes.

**Expected failure:** the figure is identical across periods.

**GREEN.** Should pass from 5.1.

### Gate and PR

Full five-command gate. `flows.test.ts`'s existing cases must pass **untouched** — the engine is
not what changes. PR title: `Scope investment figures to the reported period`.

**Done when** every number on the card describes the same window as the chart beside it, and the
chart makes market growth visually distinct from money you put in.

---

## Stage 6 · Hide categories from stats

**Branch:** `feat/hide-categories-from-stats` · New capability

> **Blocked on Q3 and Q4** — both change the shape of cycle 6.1. Settle them first.

### What's there today

Nothing — `Category` has `is_archived`, `color` and `icon`, and no notion of statistical exclusion.
Archiving is not a substitute: an archived category stops being offered on new entries, which is
not what "hide from stats" means for a category you still use.

Two facts make this cheaper than it looks. `repo.ts` notes that IndexedDB records are schemaless,
so adding a field needs **no `DB_VERSION` bump**. And every reporting function already takes
`categories`, while every dashboard widget reads `transactions` from one `WidgetContext` — so a
single filter at that boundary covers the whole screen.

### Cycle 6.1 — the field, and import compatibility `pure`

**RED.** In `src/core/model/schemas.test.ts`, assert a category object **without**
`excluded_from_stats` parses and defaults to `false`.

**Expected failure:** a zod `invalid_type` error on the missing key.

**GREEN.** Add `excluded_from_stats` to `CategorySchema` with a default of `false`. The default is
not cosmetic: `CategorySchema` validates **imports** (`export.ts:89`), so without it every
previously exported file fails to import. Add a matching case to `export.test.ts`.

### Cycle 6.2 — the filter `pure`

**RED.** Add `statsTransactions(txns, categories)` cases. Assert:

- Rows filed under an excluded category drop.
- **Transfers survive** — they carry no category.
- An uncategorised row survives.
- A category row with the field absent entirely (an old stored record) is treated as included.

**Expected failure:** `statsTransactions is not a function`.

**GREEN.** Implement it, pure.

### Cycle 6.3 — one filter covers the screen `tree`

**RED.** Assert `DashboardView`'s `data` memo passes filtered transactions — call the component and
walk to the `WidgetContext` it builds, with one excluded category seeded.

**Expected failure:** the excluded category's rows are present.

**GREEN.** Apply `statsTransactions` once in `DashboardView`'s `data` memo, so every widget
inherits it and none of them has to know.

### Cycle 6.4 — the user can see what they did `tree`

**RED.** Assert `CategoriesView` renders a "Hide from stats" item in the row's `RowActions`, and
that an excluded row renders a visible marker.

**Expected failure:** neither present.

**GREEN.** Add both. A category silently missing from every chart with no indication anywhere is a
worse bug than the one being fixed.

### Cycle 6.5 — end to end `e2e`

**RED.** Log an expense, note a dashboard total, hide its category, assert the total drops by that
amount and the category row shows as hidden.

**GREEN.** Should pass from 6.2–6.4.

### Gate and PR

Full five-command gate. PR title: `Let a category be hidden from stats`.

**Done when** hiding a category removes it from the dashboard's numbers, the Categories screen says
so plainly, and an export from before the change still imports.

---

## 3 · Progress log

Update this table in a commit on the next stage's branch, once the previous stage's PR is merged.

| Stage | Branch | PR | Status |
|---|---|---|---|
| 1 | `fix/row-menu-scroll` | #28 | merged |
| 2 | `fix/touch-responsiveness` | — | not started |
| 3 | `fix/sheet-keyboard` | — | not started |
| 4 | `fix/goal-reopen-on-edit` | — | not started |
| 5 | `fix/investment-report-window` | — | not started |
| 6 | `feat/hide-categories-from-stats` | — | not started |

---

## 4 · Unresolved

Answer these before starting the stage that depends on them. Record the answer in that stage's PR
body. Ask all questions that block the stage together.

| Q | Question | Blocks |
|---|---|---|
| 1 | **Sheet lift: instant snap, or `--dur-3` glide?** Agents split. Depends on whether iOS fires one resize at the end or several during. Step 3.0's trace answers it — or call it now. | Stage 3 |
| 2 | **Min iOS version?** iOS 15 fires no `visualViewport.resize` for the keyboard. The rAF loop covered that. Dropping it regresses 15 — in scope or not? | Stage 3 |
| 3 | **Hide-from-stats scope: dashboard only, or Plan and Budget pace too?** Plan and budgets read categories separately. Cheap to include, but "hidden" then means something stronger. | Stage 6 |
| 4 | **Excluded categories: synced field, or device-local pref?** Plan assumes a synced `Category` field. Device-local would keep it a view preference like widget layout. | Stage 6 |
| 5 | **Investments: rescope headline numbers to the period, or keep them all-time and label them?** Plan assumes rescope. All-time-but-labelled is legitimate. | Stage 5 |
| 6 | **Reopening a goal: resume its cancelled recurring rule?** Completion cancels it. Silent non-resume means the goal reopens with no funding. | Stage 4 |
| 7 | **Move the `⋯` off the right edge as well?** Separate design change. Recommend trying the gesture fix alone first. | after Stage 1 |
