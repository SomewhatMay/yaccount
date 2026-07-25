# yaccount — Architecture & Implementation Guide

> **This document is the current architecture and code map:** where things live, how the write
> path works, and the conventions a change must follow. Product behavior and locked rules live in
> [`yaccount-tech-spec-v3.md`](yaccount-tech-spec-v3.md); current state and operational hazards
> live in [`HANDOFF.md`](HANDOFF.md). Rules stated in the spec are referenced here, not repeated.
>
> Code and tests are the shipped truth. Git history is the archive for completed milestone plans.

---

## 1. Stack

| Concern | Choice |
|---|---|
| Framework | Next.js, App Router, `output: "export"` |
| Language | TypeScript, `strict`, `verbatimModuleSyntax` |
| UI | React 19 · Tailwind v4 · shadcn/ui (Radix base) · Lucide · next-themes · sonner |
| Client state | Jotai atoms (`src/features/store.ts`) |
| Charts | Recharts (the waterfall is a stacked bar with a transparent base — no second chart lib) |
| Local DB | IndexedDB via `idb` |
| Validation | zod |
| Dates | ISO `YYYY-MM-DD` strings, `date-fns` for math |
| Money | integer cents everywhere; decimal only at the input-parse and display-format edges |
| Backend | `drivestore` over Google Drive `appDataFolder` |
| Logging | `loglevel` + a ring buffer surfaced in Settings diagnostics |
| Tests | Vitest + `fake-indexeddb`; Playwright for e2e |
| Native shell | Capacitor — deferred (M10) |

**Integer cents is cross-cutting and load-bearing.** Every monetary field — `amount`,
`target_amount`, `planned_monthly`, `opening_contributed`, `reported_balance`, `template_amount`,
`budget_targets.amount` — is an integer count of cents in IndexedDB, in op payloads and in the
Drive snapshot. There is no "dollars" representation on disk or on the wire. `src/core/money.ts`
owns the two edge conversions and guards against unsafe integers and `-0`.

---

## 2. Repository map

```
yaccount/
├─ .github/workflows/pages.yml   # gated static-export deploy to GitHub Pages
├─ next.config.ts                # output: "export", optional /yaccount prefix, trailingSlash
├─ e2e/critical-flows.spec.ts    # Playwright, desktop Chrome + 390×844 mobile Chrome
├─ src/
│  ├─ app/                       # Next routes — thin, delegate to features
│  ├─ core/                      # PLATFORM-AGNOSTIC pure TS — see src/core/README.md
│  │  ├─ model/                  # zod schemas + factories for every table
│  │  ├─ money.ts                # integer-cents arithmetic, parse, format
│  │  ├─ oplog/                  # Op union, OP_TYPES, apply(), replay(), compareOps, Tx seam
│  │  ├─ repo/                   # db.ts (schema/version) + repo.ts (the write path)
│  │  ├─ commands/               # pure Op builders
│  │  ├─ engine/                 # derivations: balances, budgets, goals, plan, recurring,
│  │  │                          #   reporting, flows, ledger liveness, period resolution, filter
│  │  └─ data/                   # export format + total import validation
│  ├─ auth/                      # AuthProvider seam: pure TokenManager + GIS web glue
│  ├─ sync/                      # checkpointer, paths, JSONL serialize, origin, reset,
│  │                             #   fake-drive; drive.ts is the ONLY drivestore import
│  ├─ features/                  # React UI + Jotai; ui/ holds the design-system primitives
│  ├─ components/ui/             # shadcn copy-in components
│  └─ lib/                       # logger, log-buffer, errors, cn helper
```

### Boundaries

- **`src/core/` never imports React, Next, Capacitor or `drivestore`** — enforced by an ESLint
  `no-restricted-imports` rule. It is fully unit-testable in Node with `fake-indexeddb`. All
  financial correctness lives here.
- **`src/auth/` and `src/sync/` are platform seams**, siblings of core rather than inside it.
  `AuthProvider.ts` stays import-pure anyway so it can be tested without a browser.
- **A pure predicate over one view's own rows belongs in `src/features/<view>/filter.ts`, not
  `src/core/engine/`.** It needs view-computed context and is a presentation decision. `features/`
  code is unit-testable whenever it is pure, and several modules there are (`ledger/amount.ts`,
  `clock.ts`, `unique-name.ts`, `prefs.ts`, `shell/fab-hold.ts`).
- **Cross-cutting orchestration lives in `store.ts` atoms**, by codebase convention — a separate
  controller object for sync would be inconsistent, not cleaner.

---

## 3. The op-log write path

```
UI intent
  → command (pure Op builder)
    → Op { id, ts, type, payload }
      → Repo.dispatch:  append to `oplog`
                      + apply() to the materialized stores
                      + enqueue the op id in `outbox`
        …all in ONE IndexedDB transaction
          → engine derivations recompute from tables on read
```

**Invariants this path exists to hold:**

- The journal append and the `apply()` must be **atomic**. A crash between them desyncs the log
  from state. A throwing `apply()` (for example an op type from a newer client) aborts the
  transaction rather than leaving the op journaled.
- **`state == replay(listOps())`** is pinned by a repo test and must stay true forever.
- Ops are **idempotent by id** and applied under the canonical total order (`ts`, then `id`).
  Idempotency alone does not give convergence — ops are order-dependent, so the total order and a
  last-writer-wins policy are both required.
- Entity-level LWW is what makes this cheap: `create`/`update` ops carry the **full row** and
  reduce via `put`, so they are idempotent for free. Lifecycle flips are read-modify-write and
  no-op on a missing row, so replay stays order-independent.
- `applyOp` runs against two `Tx` implementations — an in-memory map for pure tests and replay,
  and the real IndexedDB transaction — which is what guarantees replay equals incremental
  application.

**Op taxonomy** (`<entity>.<verb>`, exhaustively listed in `oplog/types.ts`):

`category.create|update|archive|unarchive` · `container.create|update|archive|unarchive` ·
`transaction.create|update|void|approve` · `snapshot.record|update|remove` · `setting.set` ·
`budgetTarget.set|remove` · `template.create|remove` ·
`recurringRule.create|update|cancel|uncancel` · `goal.create|update|complete|cancel|uncancel|archive|unarchive`

**`OP_TYPES` is a runtime list with a compile-time exhaustiveness proof.** The `Op` union is
erased at compile time, so validating untrusted ops (an import, a remote ledger) needs a real
array; a type-level `Exclude` assertion fails the build if a new op type is added and not listed.

**Rule of thumb:** soft lifecycle (`archive`/`cancel`/`complete`), **always paired with its
inverse op and a visible restore path**, for anything financial or FK-referenced. A hard `remove`
is allowed only for non-financial housekeeping — templates, a superseded budget target, a
mistyped snapshot — and even then the removal is itself a journaled op. **Financial corrections
are always additive** (`transaction.void` appends a reversing row), which is what keeps the
balance identity auditable.

**Natural-key upserts.** `budgetTarget.set` upserts by `(category_id, start_date)` and the
snapshot writers upsert by `(container_id, date)`: the reducer drops any other row holding that
key before writing, so the rule survives a device merge and the later op in the total order wins.
No hard IndexedDB unique index — it could throw on replay.

**Seeding.** First init creates the `'general'` container through a **deterministic idempotent
op** (fixed id, epoch timestamp so it sorts first), so two fresh devices converge on one wallet
instead of minting duplicates. The `deviceId` is minted into `app_meta` and is **never an op**.

---

## 4. Persistence

`src/core/repo/db.ts` owns the schema: **`DB_VERSION = 3`**, eleven stores (the seven tables,
synced `settings`, and infra `oplog` / `app_meta` / `outbox`) and three indexes. See spec §7.1 for
what each store and index is for.

**Every upgrade branch is guarded by `objectStoreNames.contains`**, so bumping the version never
drops a populated local cache — the local cache is the local-first source of truth. Do the same
for every future store or index.

`Repo` surface beyond `dispatch`: `get`/`getAll`, `listOps` (in total order), `getDeviceId`,
`getMeta`/`setMeta`, `applyRemoteOps`, `getOutboxOps`/`clearOutbox`, and `resetTo(ops, {meta})`.

`resetTo` is the local half of every data-tool flow: it clears the state stores, the oplog and the
outbox, journals the supplied ops, replays them, **preserves `app_meta` and the `deviceId`**, and
stamps the new generation — all in one transaction, aborting on a bad op. A cleared device
re-seeds the general wallet deterministically, so two cleared devices converge.

---

## 5. Sync

`src/sync/` is pure except `drive.ts`.

- **`paths.ts`** — the Drive layout and its name guards. A live ledger's name body is the bare
  device id; an archive ends `_YYYY-MM`.
- **`serialize.ts`** — ledgers are **JSONL** (append-friendly; a torn trailing line from an
  interrupted append is skipped, not thrown on). The snapshot is one JSON object.
- **`checkpointer.ts`** — a pure `runSync(deps)` over a `DriveFS` seam: pull → merge → push →
  collapse → truncate. See spec §5.3 for the protocol and §5.4 for the merge rules.
- **`origin.ts` / `reset.ts`** — the reset generation and the clear/import/rollback and adoption
  flows (spec §5.5).
- **`drive.ts`** — the only `drivestore` import, and the only place drivestore's error shape is
  interpreted. It memoizes `createDriveStore({ accessToken, rootName: "yaccount" })`.
- **`fake-drive.ts`** — the in-memory `DriveFS` the merge and reset tests run against, including
  an `offline` mode for failed-read regression tests.

**Merge implementation.** `Repo.applyRemoteOps(ops)` unions genuinely new ops into the journal and
then **rebuilds materialized state by re-replaying the whole journal under the canonical order**,
in one transaction. It dedups first and early-returns when nothing new arrived, so a quiet tick is
free. It deliberately does **not** enqueue to the outbox — that is what guarantees a device only
ever appends its own ops to its own ledger.

**Cadence** (all background, never boot-gating): a kick at boot, a periodic pull every 45s, a
1.5s-debounced push after local edits, and a sync on tab focus/visibility. The collapse threshold
is 500 un-snapshotted ops. The sync atom claims its run guard synchronously so focus and
visibility cannot double-fire.

**Accepted simplifications:** the merge rebuilds fully each time it has work; the snapshot op set
grows with history; a same-day snapshot collision resolves by delete-by-key upsert rather than a
natural-key row id (kept deliberately — with total-order re-replay the outcome is deterministic).

---

## 6. Auth

`src/auth/AuthProvider.ts` holds the interface and a **pure, platform-free `TokenManager`** — no
`window`, no GIS — so it is unit-testable in Node and sync can be tested against a fake provider.
`web.ts` is the client-only Google Identity Services glue: it promise-memoizes the script load,
adapts the GIS callback pair into a promise, and maps silent to `prompt: ''` and interactive to
`prompt: 'consent'`. `getAuthProvider()` is a module singleton, like the repo handle.

Surface: `signIn`, `signOut`, `isSignedIn` (a valid token is held — an implementation detail),
`isConnected` (the durable grant — the user-facing state), `getAccessToken` (silent, then
interactive), `getAccessTokenSilent` (resolves `null` instead of raising a popup — what background
sync must use), and `restoreSession`.

The UI's connected state is tri-state: `null` renders a same-size invisible placeholder until the
grant is read, so no misleading "Sign in" flashes before restore and the header does not shift.

See spec §3 for the durable-grant model and why the web flow has no refresh token.

---

## 7. UI conventions

**Read spec §9 in full before writing any UI.** It is law. Quick map of where the law lives:

- **Tokens** — `src/app/globals.css`. Semantic tokens only, never raw hex. `theme.test.ts` parses
  the ramp and asserts AA contrast and tint.
- **Type** — `src/app/layout.tsx` wires Fraunces / Geist / Geist Mono. Amounts are always
  `font-mono` + `.tnum`.
- **Category identity** — `src/features/category-color.ts` and `category-icons.tsx`.
- **Primitives** — `src/features/ui/`, re-exported from its `index.ts`. Compose them; do not
  re-derive the language in Tailwind classes.
- **Patterns** — create and edit both open a `ResponsiveSheet`; per-item actions go through
  `RowActions`; lists are date-grouped register rows; feedback is `sonner`; soft rules are inline
  arm-then-confirm, never `window.confirm`; a no-undo destructive act uses `ConfirmDestructive`.
- **State** — new persisted-data atoms go in `src/features/store.ts` and must be refreshed in
  `refreshAtom`. Device-local view preferences go through `prefs.ts` / `useLocalPref`, never into
  the op log.

**Add UI components with `npx shadcn@latest add <name>`**, and reach for one before hand-rolling.

---

## 8. Testing

- **Engine and logic (the bulk):** Vitest over pure functions in `src/core/`, no DOM. Every
  worked example in the spec's goal and plan sections is a named test. This is where financial
  correctness is guaranteed.
- **Data layer:** Vitest + `fake-indexeddb` — op idempotency (a table-driven test over *every* op
  type, so adding an op without a proof fails loudly), replay equality, shuffled-replay
  convergence, version-upgrade with real data, and soft-delete integrity.
- **Sync:** two-client merge, offline-then-merge zero-loss, per-device isolation, collapse →
  archive → truncate, fresh-device rebuild, delta-not-replace, fresh-account empty root, and the
  failed-read regressions — all against the in-memory fake. Real-Drive round-trip is a manual
  two-profile browser check; it cannot be Vitest-covered.
- **Property tests** pin the two load-bearing invariants: the balance identity over approved,
  non-template rows with both transfer legs; and that replaying a **totally ordered** op set is
  idempotent. Assert equality under the canonical order — ops are not commutative, so arbitrary
  permutations are not the property.
- **e2e:** `e2e/critical-flows.spec.ts` runs the critical local-first flows on desktop Chrome and
  390×844 mobile Chrome.

Commands are in [`README.md`](README.md#verification).

---

## 9. Deployment

`.github/workflows/pages.yml` runs on pushes to `main`: `npm ci` → Vitest → typecheck → lint →
static export → Pages artifact → deploy. A missing `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID` exits with
an annotation *before* install or build, so a misleading green deployment is impossible.

`next.config.ts` throws before compilation on the same condition, enables the `/yaccount`
`basePath`/`assetPrefix` only when `YACCOUNT_GITHUB_PAGES=true`, and sets `trailingSlash` so every
route emits a directory index. **The prefix is deployment-only** — local dev, Playwright and the
future Capacitor build stay rooted at `/`, and the trade-off is that production parity requires an
explicit prefixed build.

---

## 10. Invariants and failure rules

Distilled from adversarial audits and from bugs that actually shipped. Each is a current rule, not
history.

1. **Remote merge replays the union under the canonical order.** Applying remote ops in arrival
   order lets a late older update clobber a newer local edit.
2. **Each device writes only its own live ledger.** Merged remote ops are never re-queued for
   push.
3. **A failed read never means missing data.** Resolve to "unknown" and act only on a positive
   reading; never forget a generation you hold; abort rather than treat a failed enumeration as an
   empty store. In a store with no atomic primitives, silence is not an answer.
4. **Reset operations retire the existing world first.** Clear, import and rollback back up
   everything before overwriting, and abort if the backup cannot be made complete.
5. **Unknown op types cannot wedge sync.** An op type from a newer client is dropped rather than
   journaled, and a throwing apply aborts its transaction.
6. **Financial corrections stay additive and reversible.** Never an in-place edit of history,
   never a destructive delete of a transaction.
7. **Every derivation applies both balance caveats** — the `to_container_id` leg, and the
   approved/non-template filter. `contributed` in particular must exclude pending transfers: an
   auto-contribution moves money only on approval, and counting it early inflates progress.
8. **Row liveness is a chain walk with deterministic cycle handling**, and only *live* reversals
   hide a row — a pending or template reversal must not.
9. **Money parsing is anchored and safe-integer guarded.** A global strip of `$`/`,`/whitespace
   turned `"12.3 4"` into `$12.34`; values past 2^53 silently break the exact-sum premise.
10. **Dates are calendar dates.** `zIsoDate` rejects non-calendar values, `yearMonth` must agree
    with `date`, and names are trimmed and NFC-normalized before a uniqueness check.

---

## 11. Conventions that have bitten this repo

- **Derive "today" from the local calendar (`src/features/clock.ts`), never
  `new Date().toISOString().slice(...)`.** That yields the *UTC* day; on a UTC-4 machine every
  entry after 8pm landed on tomorrow. Calendar arithmetic, not UTC slicing, in any new UI code.
- **`overflow-hidden` breaks `position: sticky` inside it** — it establishes a scroll container.
  Use `overflow-clip`. Change a card only when it gains a sticky child.
- **`:hover` does not exist on a phone.** Anything behind `group-hover:` is unreachable on touch,
  not merely subtle. Use `RowActions` rather than restating the class list.
- **Do not wrap a `<label>` around a Radix control.** They render a `<button>`, so a wrapping
  label leaves double-toggling to the browser. Use `<Label htmlFor>` as a sibling, sized to the
  full row so the whole hover area is pressable.
- **Tailwind arbitrary values need underscores around `+`/`-` inside `calc()`** —
  `bottom-[calc(4.25rem_+_env(safe-area-inset-bottom))]`. Without them the declaration is dropped
  silently.
- **Do the 390px arithmetic before calling a row "a bit tight."** Content width at 390 is 350px.
- **A sticky element inside the reading column clears the top bar at `top-16`**, beneath the
  bar's own z-index.
- **`react-hooks/set-state-in-effect` is enforced.** Use lazy `useState` initializers,
  `useSyncExternalStore`, or a deferred callback — never a sync `setState` in an effect body.
- **`verbatimModuleSyntax`** → `import type` for type-only imports.
- **Adding a required field to a zod table schema breaks literal fixtures.** Grep for them;
  `schemas.test.ts` is usually the only one, since everything else builds via model factories.
- **An `sr-only` file input is still a control in the accessibility tree.** Use `hidden` and drive
  it from a real labelled button; the `filechooser` event is also the reliable Playwright path.
- **`shadcn add` prompts and will hang on a non-TTY** when a dependency component already exists.
  Pipe answers in, then check `git status` — the CLI can rewrite `globals.css`, where the token
  ramp lives.
- **Never run `prettier --write` across the whole repo** — it rewrites pre-existing drift into
  your diff. Format only the files you touched.

---

## 12. Deferred

See spec §8 for the full list. The two that most often need restating: **M10 Capacitor native
packaging** and **movable/hideable dashboard widgets**, both deferred by explicit user decision.
The widget registry's stable ids are the seam the second will wrap — keep them stable.
