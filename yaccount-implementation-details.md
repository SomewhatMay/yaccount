# yaccount — Implementation Details & Milestone Roadmap

> **Purpose:** Turn `yaccount-tech-spec-v3.md` (the *what*) into an ordered, testable build plan (the *how* and *in what order*). Every section references the spec by number. The spine is a milestone list where **each milestone ships one coherent, independently testable slice** — you can stop after any **product** milestone (M2 onward) and have a working, demoable app. (M0 is a bare scaffold and M1 is test-only with **no UI** — neither is user-demoable.) Nothing here changes a locked decision; it only sequences and operationalizes them.
>
> **Companion to:** `yaccount-tech-spec-v3.md`. Read that first for rationale; read this for build order.

---

## 0. Guiding Build Principles

These are the invariants every milestone must respect. Violating one is a re-architecture risk — exactly what the MVP mandate (spec §1) forbids.

1. **Local-first, sync-later, but op-log from day one.** We build and fully exercise the app against local IndexedDB *before* wiring Google Drive. But the **append-only JSON operation log** (spec §8.2) is the write path from Milestone 1 — every mutation is an op appended to a local journal *and* applied to IndexedDB materialized state. Sync (M9) then only has to ship that journal through `drivestore`; it is not a rewrite of the data layer. This is what makes "engineered from day one so sync never requires re-architecture" (§1) literally true. **Corollary (spec §8.6): the app opens instantly from the local cache and NEVER blocks boot on the network** — reads/writes work in the first frame; Drive sync is always a background task with a non-intrusive indicator, reconciled as a delta (never a wholesale replace). This is why local-first isn't just a build convenience — it's the runtime UX contract.

2. **The ledger is the source of truth; everything else is derived.** `transactions`, `categories`, `containers`, `budget_targets`, `container_snapshots`, `recurring_rules`, `goals` are the only persisted tables (§7). Balances, contributions, progress, dashboards, and the monthly allocation plan are **computed on demand** (§5.9.7, §6.8) — never stored, never denormalized into a mutable field. Any temptation to cache a balance *as state* is a bug.

3. **Never silently lose, move, or overwrite a transaction — and never make an action one-way** (§1.1, §5.5, §5.9.6). **Reversibility is the product's spine (spec §1.1 — read it):** every user action ships with its inverse, the inverse is itself an appended op (never an erasure), and it is *visible* — an Archived list + Restore control + an **Undo action in the toast**, not merely reconstructible from the journal. Archive ⇄ unarchive; delete a transaction ⇄ undo the delete (a row reversing the reversing row); a reported balance can be edited or removed. For *categories, containers, and goals* deletes are soft (`is_archived`); **transactions have no `is_archived` field (§5.4)** — a transaction is never destructively deleted or archived, only superseded by an explicit correcting/reversing ledger op (a void must itself be an `amount` row so `balance = SUM(amount)` stays exact and auditable). This is a testable property, not a slogan — but note only M9's How-to-test currently pins a named assertion for it; M2–M8 should each add one where they touch data.

4. **Signed-amount convention everywhere** (§5.4): negative = outflow, positive = inflow. No separate refund/credit concept. **But `balance = SUM(amount)` is a simplification, not the literal formula:** a Transfer is a *single* row keyed to the source `container_id`, so the destination is credited only via `to_container_id`, and template/pending rows are not live ledger entries. The real balance is `SUM(amount WHERE container_id = c) − SUM(amount WHERE to_container_id = c)` over `inbox_status = 'approved' AND is_template = false` rows (see spec §5.4 "Balance computation"). Every derivation — balance, `contributed`, Container Flows, Reconstructed Balance — must honor these two caveats.

5. **Three independent axes stay independent** (§5): category (*what money does*) ⟂ container (*where money lives*) ⟂ goal (*what a pool accumulates toward*). No code path may collapse them.

6. **Same build, three surfaces** (§2.1). No platform fork. Platform differences are confined to two seams: the `AuthProvider` (§3.4) and native **secure-token storage** for the refresh token (§3.3-A). There is *no* app-data storage-adapter seam — §2.3 fixes IndexedDB identically across all three surfaces. All business logic **in `src/core`** is platform-agnostic and unit-testable in Node (the auth/GIS/Capacitor glue is not).

7. **Product milestones (M2–M7) are demoable/testable in a plain desktop browser; the platform milestones carry extra requirements** — M8 a Google OAuth flow, M9 network/Drive, M10 physical iOS/Android devices. Note the *dependency* independence still holds (product logic never depends on auth/sync/native), but per §9 Q1/Q7 the *execution order* now pulls M8–M9 early (after M2) because cloud sync is a hard v1 requirement (§7). Native (M10) remains last before design.

---

## 1. Tech Stack & Tooling (concrete choices)

| Concern | Choice | Notes / spec ref |
|---|---|---|
| Framework | **Next.js** (latest stable), `output: 'export'` | §2.2 — static export, no SSR/API routes used today; preserves upgrade path |
| Language | **TypeScript**, `strict: true` | Non-negotiable for financial data integrity |
| UI runtime | React (bundled with Next) | §2.2 |
| Client state | **Jotai** (atoms) for cross-component UI state | **Added M2.** Boilerplate-free vs. React context; client-only, so Capacitor/static-export safe and `src/core` stays pure (state lives in `src/features`). React context reserved only for genuinely tree-scoped concerns; the `Repo` (IndexedDB handle) is a module singleton, not an atom. |
| Styling | **Tailwind CSS v4** + CSS variables for design tokens | §1 design tenets; tokens finalized later (§10.6) |
| UI components | **shadcn/ui** (Radix base, `radix-nova` style, `neutral`) + **Lucide** icons + **next-themes** + **sonner** | **Added M2.** Copy-in components under `src/components/ui/` (not a runtime dep lock-in). **Policy: always reach for a shadcn/ui component first; only hand-roll when no shadcn component/registry scaffold exists.** Prefer **Lucide** icons everywhere. All client-side → static-export + Capacitor safe; `src/core` stays UI-free. Fonts: **Fraunces** (display) / **Geist** (body) / **Geist Mono** (amounts). M2 ships a light first-pass identity ("Quiet register": iris brand + emerald positive tokens in `globals.css`); the full design system stays **M11**, which evolves these tokens rather than restarting. |
| Charts | **Recharts** (React, declarative SVG) | §6.5 inventory. **Waterfall = stacked `BarChart` + transparent base series (locked M5)**; custom SVG only as fallback. Web-SVG only — *not* React Native (Capacitor/WebView) |
| Local DB | **IndexedDB** via a thin typed wrapper (**`idb`** by Jake Archibald) | §8.2 — works in browser + Capacitor WebView |
| Validation | **`zod`** — runtime schemas + refinements per table | §5 CHECK constraints; used from M0/M1 (was missing from this table) |
| ID generation | `crypto.randomUUID()` | All PKs are TEXT UUID; **needs a secure context** (HTTPS/localhost; OK in Capacitor WebView) |
| Dates | Store as ISO `YYYY-MM-DD` strings; **`date-fns`** for math | §5.x; avoid Date-object timezone traps — treat dates as calendar dates, not instants |
| Money | **Persist integer cents** — in IndexedDB, op payloads, and snapshot alike; decimal only at input-parse / display-format edges | §5.4 `REAL` is nominal (IndexedDB stores doubles regardless); integer cents = zero drift, exact `SUM`. **Locked M1.** |
| Backend store | **`drivestore`** (already built, §4) | Introduced at M9 |
| Native shell | **Capacitor** (latest) | §2.1; added at M10 |
| Native OAuth | `@capacitor-community/generic-oauth2` + a secure-storage plugin | §3.3-A |
| Web OAuth | Google Identity Services JS (`google.accounts.oauth2.initTokenClient`) | §3.3-B |
| Testing | **Vitest** (unit/logic) + **fake-indexeddb** (data layer) + **Playwright** (e2e, later) | See §5 below |
| Lint/format | ESLint + Prettier | Standard |

**Integer-cents rule (cross-cutting, LOCKED M1):** `amount` (and every monetary field — `target_amount`, `planned_monthly`, `opening_contributed`, `reported_balance`, `template_amount`, `budget_targets.amount`) is **persisted as an integer count of cents** everywhere it lives: IndexedDB stores, op-log payloads, and `snapshot.json`. Decimal appears only at two edges — parsing user input and formatting for display. There is no "REAL dollars" on disk or on the wire; the spec's `REAL` is a nominal/display type only, since IndexedDB stores all numbers as doubles regardless. This makes `balance = SUM(cents)` exact integer math. All test fixtures use cents. Add a `money.ts` module in M1 owning the two edge conversions.

---

## 2. Repository Structure (target)

```
yaccount/
├─ next.config.js            # output: 'export'
├─ capacitor.config.ts       # added M10
├─ src/
│  ├─ app/                   # Next.js routes (thin; delegate to features)
│  ├─ core/                  # PLATFORM-AGNOSTIC, pure TS — the heart
│  │  ├─ model/              # types + zod schemas for every table (§5)
│  │  ├─ money.ts            # integer-cents arithmetic + formatting
│  │  ├─ oplog/              # op definitions, apply(), journal (§8.2)
│  │  ├─ repo/               # repository interfaces + IndexedDB impl
│  │  ├─ engine/             # derivations: balances, budgets, goals, plan
│  │  │  ├─ balances.ts      # §5.7
│  │  │  ├─ budgets.ts       # time-variant resolution §5.3
│  │  │  ├─ goals.ts         # contributed/progress/required_monthly §5.9
│  │  │  ├─ recurring.ts     # due-date + generation §5.8
│  │  │  └─ plan.ts          # monthly allocation plan §6.8
│  │  └─ reporting/          # aggregations feeding charts §6
│  ├─ auth/                  # AuthProvider abstraction §3.4 (added M8)
│  │  ├─ AuthProvider.ts     # getAccessToken(): Promise<string>
│  │  ├─ web.ts              # §3.3-B
│  │  └─ native.ts           # §3.3-A
│  ├─ sync/                  # drivestore checkpointer §8.4 (added M9)
│  ├─ features/              # UI feature modules (React + Jotai atoms in store.ts)
│  ├─ components/            # ui/ = shadcn/ui copy-in components (added M2); theme-provider.tsx
│  └─ lib/                   # utils.ts (cn helper from shadcn)
└─ tests/
```

> **UI convention (M2+):** feature components live in `src/features/`; reusable primitives are **shadcn/ui** components under `src/components/ui/` (regenerate/extend via `npx shadcn@latest add <name>`). Cross-component state = **Jotai** atoms (`src/features/store.ts`). Icons = **Lucide** (`lucide-react`).
>
> **⚠️ The visual design language is LOCKED — spec §12 "The Standing Register" is law.** Before building ANY UI, read spec §12 in full. Do not improvise palette, typography, or layout; do not drift from it component-by-component. Quick map of where the law lives in code:
> - **Tokens** — `src/app/globals.css`: iris `--brand`/`--primary`/`--ring`, emerald `--positive` (→ `text-positive`), rose `--destructive` for true-negative only; neutral base. `.tnum` = tabular figures. Use **semantic tokens only**, never raw hex.
> - **Type (3 roles)** — `src/app/layout.tsx`: **Fraunces** display (`font-display`) for hero figures/headings/wordmark, restraint only; **Geist** body; **Geist Mono** (`font-mono`) for **every amount**, always with `.tnum`.
> - **Category color** — `src/features/category-color.ts` `categoryDotColor(id)`: deterministic hue dot; the only category-swatch scheme (foreshadows §5.1/§10.1 auto-palette, formal at M5).
> - **Patterns** — **(M11, revised 2026-07-22)** create = a **`ResponsiveSheet`** off the page header's **New** action (or the quick-add FAB for a transaction); edit = the same sheet — NEVER a mode-swap of a create surface. **The inline iris compose-bar is retired and `ComposeBar.tsx` is deleted** (spec §12.4 (M11)) — do not rebuild it. Per-item actions = the **`⋯` DropdownMenu** via `RowActions` (hidden on hover-capable pointers only); lists = **date-grouped register rows**; feedback = **`sonner`** toasts; soft rules = **inline arm-then-confirm**, never `window.confirm`. Copy = sentence case, user-side voice (§12.6).
>
> **Also read spec §1.1 (reversibility) — every destructive-looking control needs a visible inverse: an Archived list, a Restore button, an Undo action in the toast.**
>
> **Also read spec §12.4-a (M3):** inline rename = explicit ✓/✗, never commit-on-blur; anything loggable repeatedly shows its **history** with per-row `⋯` Edit/Delete (never a write-only form); the money direction is a visible `−`/`+` control (`SignToggle`), not a typing convention; toggle menu entries are checkbox items with a **leading** indicator.
>
> M11 completed the finishing pass ON TOP of §12: motion/states, responsive shell/density, tested contrast and user-directed category icons. Colour customization stayed model/rendering-only; no picker shipped.

**Key structural rule:** `src/core/` never imports React, Next, Capacitor, or `drivestore`. It is pure TypeScript, fully unit-testable in Node with `fake-indexeddb`. This is what lets us validate all product logic before any platform/sync work.

---

## 3. Architectural Spine: the Op-Log write path

Established in M1, used unchanged forever. Every state mutation flows through this pipe:

```
UI intent
   → command (e.g. addTransaction, archiveCategory)
      → produces one Op { id: uuid, ts: ISO, type, payload }
         → append Op to local journal (in-memory + IndexedDB 'oplog' store)
         → apply(Op) mutates IndexedDB materialized stores (the "tables")
            → engine derivations recompute from tables on read
```

- **Ops are the atoms of sync.** Replaying the same Op twice is a **no-op** (idempotent by `id`) — §8.2. This property is unit-tested in M1. **Idempotency alone is *not* sufficient for conflict-free merge**, though: ops are order-dependent (an `updateTransaction` after its `create`), so deterministic convergence also needs a defined **total order** (timestamp + `id` tiebreak, §8.2) and a **conflict policy** for concurrent edits to the same entity (e.g. last-writer-wins). Idempotency only guarantees replays don't double-apply.
- **Materialized tables are a cache of the op-log.** In principle rebuildable by replaying every op — but after an op-count-triggered collapse (§8.4) "every op" is split across the snapshot **plus** any archived `ledger_<deviceId>_YYYY-MM.json` files, not one live log. In practice IndexedDB holds the live materialized state and this device's oplog for sync; the snapshot (§8.4) is a periodic consolidation of all device ledgers. **The journal append and the materialized-table `apply()` must run in a single IndexedDB transaction** — a crash between them would desync the log from state.
- **Soft-delete and edits are ops too** — an `archive` op, an `updateTransaction` op — never a destructive IndexedDB `delete`. (Hard-delete only ever applies to the app's own housekeeping, never user financial data.)

**Initial op taxonomy (decided; extended per milestone).** Every op is `{ id: uuid, ts: ISO, type, payload }`, idempotent by `id`, applied by a per-`type` reducer. Naming is `<entity>.<verb>`. Starting set:
- `category.create` · `category.update` · `category.archive` · `category.unarchive` (M2/M3)
- `container.create` · `container.update` · `container.archive` · `container.unarchive` (M3)
- `snapshot.record` · `snapshot.update` · `snapshot.remove` — a `container_snapshots` row (M3). **Both writers upsert by the natural key `(container_id, date)`** — one report per container per day (spec §5.6), same pattern as `budgetTarget.set`; the reducer drops any other row holding that key, so the rule holds across device merges. **`remove` is a genuine hard delete and the only one in the reducer** — a snapshot is a typed *observation*, not a money movement (nothing derives a balance from it), so it is housekeeping by the rule of thumb below. The audit trail survives regardless: the removal is itself a journaled op, so record → update → remove all persist in the log and state is their replay (spec §5.6).
- `budgetTarget.set` — **upsert** by `(category_id, start_date)` · `budgetTarget.remove` (M4)
- `transaction.create` · `transaction.update` · `transaction.approve` (pending→approved) · `transaction.void` — creates a reversing `amount` row, never a destructive delete (M2/M6). **Undo of a delete** is another `transaction.void` whose row reverses the *reversing* row (`unvoidTransaction`), so liveness is a chain walk — `activeRows` in `core/engine/ledger.ts`, never an ad-hoc "has a reverser" check in a component. **The reversing row carries `reverses_id` → the original's id** (nullable field added to §5.4 in M2, user-blessed — see §10 #24); the reducer just `put`s the row (idempotent), the original is never touched.
- `template.create` · `template.remove` — templates are shortcuts, not ledger data, so hard-remove is allowed (M6)
- `recurringRule.create` · `recurringRule.update` · `recurringRule.cancel` (M6)
- `goal.create` · `goal.update` · `goal.complete` · `goal.cancel` · `goal.archive` (M7)

Rule of thumb: **soft-lifecycle** (`archive`/`cancel`/`complete`) — **always paired with its inverse op and a visible restore path** (§0.3) — for anything financial or FK-referenced; **hard `remove`** only for non-financial housekeeping (templates, a superseded `budgetTarget`, a mistaken `container_snapshot`). Financial corrections are always additive (`transaction.void` = reversing row), keeping `balance = SUM` auditable (§0.3).

Getting this seam right in M1 is the single highest-leverage decision in the whole plan. Everything after M1 is "add a table, add ops, add an engine derivation, add UI."

---

## 4. Milestone Roadmap

Each milestone: **Goal · Scope · Deliverables · How to test · Exit criteria.** Milestone **numbers** encode dependencies; the **execution order** (§7) pulls auth+sync (M8–M9) forward to right after M2, since cloud sync is a hard v1 gate (§9 Q1/Q7). M2–M7 are local-first product work; M8–M9 add auth + cloud sync (built early); M10 is native packaging; M11 is design polish.

> **Sequencing rationale (sync pulled EARLY — updated per §9 Q1/Q7):** Cloud sync is a **hard requirement for v1**, not an optional end-cap — a finance app without backup/multi-device isn't shippable. Since sync rides only on the M1 op-log + M8 auth (nothing from M3–M7), we build auth (M8) + sync (M9) right after the core ledger (M2), so every subsequent feature syncs for free and the sync path is proven early instead of bolted on last. The op-log spine (M1) still guarantees no rework. Auth/Drive registration has real-world lead time — the **parallel §6 track** starts during M0 so it never gates M8. (Trade-off vs. the old "product-first, sync-last" plan: a bit of network/OAuth in the loop sooner, heavily mitigated by local-first §8.6 — the app runs fully offline regardless.) The milestone **numbers** are kept stable for cross-references; only their execution order moves (see §7).

---

### M0 — Project Scaffold & Tooling
**Goal:** A running, deployable static Next.js app skeleton with the full toolchain.
**Scope:**
- `create-next-app` (TypeScript, App Router), set `output: 'export'`, confirm `next build` emits static `out/`.
- Tailwind, ESLint, Prettier, Vitest, `fake-indexeddb`, `idb`, `date-fns`, `zod`.
- Establish `src/core/` boundary + a lint rule / import boundary preventing `core` from importing UI/platform code.
- CI-less local scripts: `dev`, `build`, `test`, `lint`, `typecheck`.
- A trivial placeholder home page that renders.

**How to test:** `next build` produces static output; `npm run dev` serves it; one trivial passing Vitest test.
**Exit criteria:** App builds to static HTML and runs in a browser tab; test/lint/typecheck all green.

---

### M1 — Core Data Layer: model, money, op-log, IndexedDB repo
**Goal:** The architectural spine (§3) in code, with **no UI** — validated entirely by tests.
**Scope:**
- **Types + zod schemas** for all seven tables (definitions span §5.1–§5.9.2; §5.10 is edge-cases, not a table). Encode CHECK constraints as zod refinements (e.g. `type IN ('expense','income')`, `amount ≥ 0` where required). **Do NOT** couple `amount` sign to category type in the schema — sign ⟂ type is a **UI default only** (§10 #13), so voids/reversals/refunds keep the opposite sign. Money fields are **integer cents** (§1, locked). Transactions additionally carry a **stored `yearMonth`** string (derived from `date` at write time) so the compound indexes (§8.3) can key on it — IndexedDB can't compute it at index time.
- **`money.ts`** — integer-cents arithmetic + parse/format (§1 rule above).
- **Op-log**: `Op` type, an `apply(state, op)` reducer per op type, idempotency by op `id`, the append-only journal backed by an IndexedDB `oplog` object store.
- **IndexedDB schema + repository layer**: object stores for each table (plus infra stores `oplog` and `app_meta`); create **both** transaction indexes up front — **`by_container_category_month`** (§8.3) and **`by_container_month`**; an in-memory active-period cache stub (§8.3) — real warming deferred to M5. **Why two:** `by_container_category_month` **excludes transfers** (their `category_id` is NULL, and IndexedDB drops records with a null key-path component), so Container Flows (M5) reads the transfer-inclusive `by_container_month` instead.
- **First-init seeding**: auto-create the `'general'` container with `include_in_overall_balance = true` (§5.2); **mint a `deviceId`** = `crypto.randomUUID()` and persist it in a small IndexedDB `app_meta` store (device-local, **never synced** — it names this device's `ledger_<deviceId>.json`, §8.4). If IndexedDB is later cleared, a fresh `deviceId` is minted → a new ledger file; the old one stays valid in Drive and still merges on boot (folded into the next snapshot — no data loss).

**How to test (Vitest + fake-indexeddb):**
- Apply an op → table reflects it. Apply same op twice → identical state (idempotency).
- Round-trip: append N ops, rebuild materialized state by replay, assert equality with incremental application.
- Money arithmetic never drifts (property test: sum of signed cents).
- `'general'` container exists and is opted into overall balance on fresh init.

**Exit criteria:** All CRUD-as-ops paths for at least `categories` and `containers` pass; replay idempotency proven. No UI yet.

---

### M2 — Categories & the Transaction Ledger (expense/income)
**Goal:** First **user-visible** feature: add/list/edit expense & income transactions against categories. The MVP's atomic core (§7).
**Scope:**
- Category CRUD (create, rename, archive **and unarchive** — soft only §5.5, uncapped §5.1; the Categories screen lists archived items with a Restore control), `type` expense/income, `color` left **null** (hybrid: deterministic auto-palette at render in M5, optional user override in M11 — §10.1 resolved).
- Transaction create/edit for the **expense/income shape** (§5.4): `category_id` set, `to_container_id` null. All against the default `'general'` container implicitly (containers UI comes in M3). **No destructive delete** — a "delete" is a reversing/void ledger op, never a row removal (§0.3); "CRUD" here excludes hard-D.
- Signed-amount handling + **explicit-minus display rule** (§5.4 "Starbucks: −$10"). Entry form **auto-signs by category type** (expense→negative, income→positive) and **confirms on an unusual sign** (soft rule, §10 #13) — opposite signs stay allowed for later voids/refunds.
- Basic transaction list view + add/edit form.

**How to test:** Add income + expenses; list renders with correct signs; edit/archive works; `balance = SUM(amount)` on `general` matches by hand. Vitest covers the engine; manual browser check for UI.
**Exit criteria:** Can log and review real expenses/income in the browser; archived categories vanish from pickers but old transactions still resolve (§5.5).

---

### M3 — Containers, Transfers & Balances
**Goal:** The "where money lives" axis (§5.2) and the transfer shape (§5.4).
**Scope:**
- Container CRUD (create/rename/archive **+ unarchive**, soft-only, with an Archived list + Restore; `is_investment`, `include_in_overall_balance` flags §5.2, **both toggleable after creation**). Enforce `'general'`'s default-true opt-in. **Unique names checked on create AND rename** (`features/unique-name.ts` `nameTaken`, case-insensitive; same for categories).
- **Container snapshots (§5.6):** `container_snapshots` CRUD + a **"Reported balances" Sheet** for `is_investment` containers (without this the `is_investment` flag is inert): log a value, see the **full history**, and **edit or delete** a mistaken one (`snapshot.update` / `snapshot.remove`). **At most one report per day per container** — the form warns inline ("this day already reports $X — saving replaces it") and the reducer upserts by `(container_id, date)`. Net Contributions = Σ transfers in − Σ transfers out. *(§5.6 had no milestone in the prior draft; gain/loss + the Reconstructed Balance engine land in M5.)*
- **Transfer** transactions (§5.4): `category_id` null, `to_container_id` set; moves money between owned containers; excluded from category dashboards.
- Per-container balance (`SUM(amount)`, may go negative → **red UI** §5.2).
- **Current Overall Balance** metric (§5.7): `SUM(balance WHERE include_in_overall_balance AND NOT is_archived)` — opt-in model, default exclude; archived containers drop out (archiving one with a live balance warns first).
- Container picker in the transaction form; **Default Spending Container** setting (§5.2, defaults `general`).
- **Container Flows data readiness** (§5.4): transfers + the `by_container_month` index (transfers are absent from `by_container_category_month`, see M1) land here, but the **Container Flows *view* is deferred to M5** — it needs the unified reporting-period control (§6.1). M3 doesn't stand up a throwaway period selector.

**How to test:** Transfer between two containers → both balances update, category charts unaffected; negative container renders red; overall balance only counts opted-in containers. Engine unit tests for each.
**Exit criteria:** Full three-shape ledger (expense/income/transfer) works; overall-balance opt-in semantics verified.

---

### M4 — Time-Variant Budget Targets
**Goal:** Per-category monthly budgets that change over time without end-dates (§5.3).
**Scope:**
- `budget_targets` CRUD: one row = "this amount effective from `start_date` until the next row" (§5.3). **Unique per `(category_id, start_date)` — `setBudgetTarget` upserts by that natural key** (replaces same-date row; no duplicates even across merges).
- **Resolution engine** (`budgets.ts`, §5.3 IndexedDB-native form): rows sorted by `start_date`; "budget on date X" = latest row with `start_date ≤ X`. Historical reports evaluate against the *then-active* budget, never the latest.
- UI to set/change a category's budget and see its history.

**How to test:** Set Groceries $300 from Jan, $600 from Jun; assert resolution returns $300 for a March date and $600 for a July date; a one-off elevated month reverts when a following row exists. Pure unit tests.
**Exit criteria:** Budget-on-date resolution correct across permanent shifts and one-off anomalies; no overlapping-row ambiguity (§5.10).

---

### M5 — Reporting & Dashboard Engine + Charts
**Goal:** The derived-view layer (§6) — the payoff of a clean ledger.
**Scope:**
- **Unified global reporting-period control** (§6.1): presets (Last month/3/6/12/YTD/All/Custom) + optional per-widget override; **two-range compare** folded in (§6.2).
- In-memory active-period cache warming at boot (§8.3), falling back to IndexedDB for historical periods.
- **Container Flows view** (§5.4, deferred here from M3): net in/out per container over the active reporting period via the `by_container_month` index, decoupled from category charts.
- **Chart inventory** (§6.5), each a distinct type:
  - Category breakdown doughnut/pie (expense + income), **genuine zero-filtering** (§6.4), period-total + period-monthly-average variants. **Color = `category.color` if set, else deterministic auto-palette by stable id** (the M5 home of the §10.1 hybrid default).
  - Monthly bar (income/expenses/savings) with budget-target overlay.
  - Single-category drill-down bar vs. its (time-variant) budget target.
  - **Income → Expenses → Savings waterfall** (§6.5, kept distinct) — built as a stacked `BarChart` with a transparent base series (locked; no second chart lib).
- **Investment/asset reporting (§5.6):** Unrealized Gain/Loss = Current Value (latest `container_snapshots.reported_balance`) − Net Contributions; the **Reconstructed Balance Engine** for historical gap-filling (nearest snapshot ± transfers in the gap, not carry-forward). *(This entire §5.6 surface was missing from the prior roadmap.)*
- **Budget Targets comparison** re-scoped to active period (§6.3, "Monthly Average" against selected window, not all-time).

**How to test:** Seed a fixture ledger spanning months; verify each chart's numbers by hand against the fixture; confirm $0 categories are omitted (§6.4); confirm switching the global period updates all non-overridden widgets. Snapshot-test aggregation outputs.
**Exit criteria:** A genuinely useful dashboard over real logged data; all four chart types render correct, period-aware numbers.

---

### M6 — Recurring Rules, Templates & the Inbox
**Goal:** Automation layer (§5.8) — first-class yaccount feature beyond the source tool.
**Scope:**
- **Templates** (`is_template = true`, §5.8): "save as shortcut" from any transaction detail; 1-tap quick-log; uncapped. This is the near-term widget substitute (§6.6).
- **`recurring_rules`** (§5.8) for all three shapes incl. transfer; `interval_config` per frequency (daily/weekly/biweekly-as-twice-monthly/monthly/annually/custom — §5.8 exact semantics).
- **Generation engine** (`recurring.ts`): compute `next_generation_date`; generate **one pending occurrence at a time** (§5.8, locked) as it comes due — not a future batch. **Backfill by mode** for occurrences missed while the app was closed: `fixed` → one pending row per missed month, oldest-first, at each due date (never skipped); `goal_derived` → a **single** current occurrence at the present already-self-corrected `required_monthly` (stacking per-month would double-count the deadline catch-up).
- **Pending/Inbox queue** (§5.8): `inbox_status = 'pending'` rows excluded from all dashboards/budgets until approved; 1-tap approve + **multi-select bulk approve**.
- `amount_mode = 'fixed'` now; `'goal_derived'` plumbing stubbed for M7.

**How to test:** Create a monthly rule; advance a simulated clock; exactly one pending row appears per due date; pending rows don't affect balances/dashboards; approve → they do. Unit-test each frequency's due-date math (esp. biweekly-as-twice-monthly and custom).
**Exit criteria:** Recurring generation + inbox approval works for fixed amounts across every frequency; templates give fast repeat logging.

---

### M7 — Savings Goals & the Monthly Allocation Plan
**Goal:** The product thesis made mechanical (§5.9, §6.8) — "every dollar a purpose."
**Scope:**
- **`goals` table** (§5.9.2): `kind` (`spend_down`/`reserve`), `mode` (`deadline`/`fixed`/`passive`), targets, `opening_contributed`, lifecycle `status`. App-level enforcement of **≤1 active goal per container** (§5.9.2, IndexedDB can't express partial-unique).
- **Goal creation may auto-create its container** (§5.9.2) so the user treats them as one object. **On name collision: reuse the existing container** as the new cycle; block only if it already has an active goal; create fresh only when no same-named container exists.
- **Derivation engine** (`goals.ts`, §5.9.7):
  - `contributed` = `opening_contributed` + net Transfers in since `created_date` (**spend_down**); progress = `contributed/target`.
  - **reserve**: progress = live `balance/target` (capped display 100%).
  - `required_monthly` per mode (§5.9.4, §5.9.7): deadline = `max(0,(target−basis)/whole_months_left)`; fixed = M; passive = 0. **`basis = contributed` for spend_down, `balance` for reserve** — so `reserve`+`deadline` spreads `(target−balance)/months_left`, `reserve`+`fixed` refills at M until `balance≥target`, and any withdrawal re-opens the ask. **Guard `whole_months_left ≤ 0`** ⇒ ask = `max(0, target−basis)` + re-plan (never ÷0).
  - `projected_completion` for fixed **with target**; open-ended fixed (no target) shows "Open-ended" — no date, no progress bar.
- **Goal-derived recurring contributions** (§5.9.5): opt-in creates a linked recurring **transfer** rule; `deadline` → `amount_mode='goal_derived'` recomputed at generation time (the one genuinely new engine behavior, §5.9.5, riding on M6's one-at-a-time generation). Completing/cancelling a goal cancels the linked rule.
- **Lifecycle** (§5.9.6): spend_down completes-and-closes at target (stays visible as achieved); reserve completes-and-oscillates; over-contribution shown >100%; cancellation never moves money; **leftover absorb → `opening_contributed`** (default on).
- **Monthly Allocation Plan** view (§6.8): `Income expected − Σ category allowances − Σ goal asks = Unallocated`; over-allocation goes red (flagged never blocked); Unallocated is computed, never a container, never auto-swept. Visualized by existing waterfall + savings bar (no new chart). **`Income expected` (§6.8, now locked):** if active **income** recurring rules cover the month → Σ their scheduled occurrences; otherwise a **user-entered** figure for the month (recurring wins when present, manual is the fallback).

**How to test:** Reproduce the spec's worked examples verbatim as unit tests:
- Clothing $200-by-Nov spend_down: contribute $200 → 100%, ask $0; −$20 shirt expense → balance $180, **contributed still $200**, ask still $0 (§5.9.3).
- Emergency fund $10k reserve: −$3,000 → progress 70%, plan re-claims shortfall (§5.9.3, §6.8).
- Deadline goal missing a month → next ask rises; overshoot → ask falls to $0 early.
- Monthly plan over-allocation renders negative/red.
**Exit criteria:** All §5.9 worked examples pass as tests; the monthly plan reconciles income against flows+stocks live. **This is MVP feature-complete** — and because sync (M9) now ships *before* M7 in the execution order (§7), completing M7 means **v1 is shippable** (features + mandatory cloud sync both done), *provided* the §5.6 investment/snapshot surface (folded into M3/M5) is also complete. Sync is NOT optional for v1 (§9 Q7).

---

### M8 — Authentication (Google OAuth, web flow first)
**Goal:** The `AuthProvider` seam (§3.4) delivering `getAccessToken()`, web flow working end-to-end.
**Scope:**
- **Prerequisite (parallel track, see §6):** Google Cloud project + OAuth consent screen in "Testing" status; **Web** SPA client ID; `drive.appdata` scope (non-sensitive, basic verification only — §3.2).
- `AuthProvider` abstraction (§3.4): single `getAccessToken(): Promise<string>` interface.
- **Web flow** (§3.3-B): GIS token client, `ux_mode:'popup'`; short-lived token; **silent re-auth** (`prompt:''`) before expiry with quick re-consent popup fallback. **Scope the fallback for all browsers, not just Safari** — third-party-storage/cookie limits hit Chromium too as cookies phase out (§10 #25).
- No refresh token on web (§3.3-B) — accepted asymmetry (§3.3 trade-off).

**How to test:** Sign in with a test-user Google account in a desktop browser; obtain a real access token; token auto-renews silently; expiry handled. (Still no data synced — that's M9.)
**Exit criteria:** `getAccessToken()` reliably returns a valid `drive.appdata`-scoped token in the browser.

---

### M9 — Google Drive Sync: the Checkpointer
**Goal:** Turn the local op-log into real multi-device sync via `drivestore` (§8.2, §8.4) — **no re-architecture**, since the op-log has existed since M1.
**Scope:**
- Wire `createDriveStore({ accessToken: getAccessToken })` (§3.1, §4) — hand it the M8 callback.
- **Instant local-first open** (§8.6, hard req): render immediately from local IndexedDB; the sync below runs **in the background** behind the live UI with a **non-intrusive "Syncing…" indicator** — never a boot-gating spinner. Only a truly fresh install (no local cache) shows a one-time snapshot-download screen. In-session edits during sync are preserved; remote ops apply as a **delta on top of live state** (idempotent by `id`), never a wholesale replace; UI re-derives reactively when sync settles.
- **Checkpointer, per-device ledgers** (§8.4): `snapshot.json` (full state, one-time on fresh device) + one `ledger_<deviceId>.json` **per device**, each device appending **only to its own** file via `drivestore.append()`; **background sync** = load snapshot → list & replay **all** device ledgers under the total order → flush queued local writes to this device's ledger → **collapse to a fresh snapshot when un-snapshotted op count > ~N (~500), checked on boot, any device** (§8.4; cheap op counter, no election since snapshot is derived).
- **Rotation** (§8.4): each device truncates **only its own** ledger to post-snapshot ops (race-free); pre-collapse ledgers optionally archived to `ledger_<deviceId>_YYYY-MM.json`.
- **Offline conflict resolution** (§8.5): local write queue; on reconnect fetch **all** remote device ledgers, merge with local under the total order, append onward to own ledger — offline-logged transactions never discarded even if other data changed elsewhere. Merge needs (a) a total order (`ts`, then `id`), (b) LWW for concurrent same-entity edits, (c) clock-skew tolerance. **Why per-device (locked, confirmed against drivestore source):** `drivestore` exposes **no conditional write** (`DriveFile` carries no etag/version; `write`→`PATCH …uploadType=media` has no `If-Match`; `append` is documented non-atomic), and Drive AppData has **no atomic CAS or create-if-absent** — so a single shared ledger cannot be made corruption-proof and a lock file isn't a reliable mutex. Per-device files guarantee no two writers ever touch the same object. See §10 #19.

**How to test:** Two browser profiles / two devices signed into the same test account: log a transaction on A → appears on B after sync; go offline on A, log, edit categories on B, reconnect → both survive, no loss (§8.5). **Explicitly test concurrent writes on both devices at once → zero lost ops** (the per-device-ledger guarantee). **Instant-open test (§8.6):** with a populated local cache, first paint is interactive before any Drive call returns; an op logged *during* an artificially-slowed sync survives and coexists with the incoming remote delta (no wholesale replace). Verify collapse + per-device truncation/archive. Assert the "never silently lose/move" property (§0.3) across a partitioned-then-merged scenario.
**Exit criteria:** True offline-capable multi-device sync with a permanent audit trail; data-integrity property tests pass across merges.

---

### M10 — Capacitor Native Packaging (iOS + Android)
**Goal:** Ship the *same build* as a native-installed app (§2.1) with native OAuth + secure token storage.
**Scope:**
- Add Capacitor; wrap the static `out/` build; confirm IndexedDB works in both WebViews (§2.3).
- **Native OAuth** (§3.3-A): iOS + Android client IDs; Authorization Code + **PKCE** via **system browser** (ASWebAuthenticationSession / Custom Tabs, never embedded webview); `@capacitor-community/generic-oauth2`.
- **Custom URL scheme redirect** (§3.5): register `com.yaccount.app://oauth2redirect` in Capacitor config + Google Cloud (native clients).
- **Refresh token → native secure storage** (Keychain/Keystore, §3.3-A) — never IndexedDB. Persistent native login. **Gotcha:** Google refresh tokens issued while the OAuth app is in **"Testing" publishing status expire after 7 days** — so "kill & relaunch → still logged in" only fully holds once the consent screen is published/verified (§3.2). Plan a re-consent path until then.
- `AuthProvider` selects native vs. web flow by platform — the only new platform seam beyond storage.

**How to test:** Run on a physical iPhone (Xcode + free Apple ID, 7-day cert §3.6) and Android device (USB debugging, no account §3.6); complete system-browser OAuth; kill & relaunch → still logged in (refresh token); sync round-trips to the same Drive account as the web app.
**Exit criteria:** One codebase installs and runs natively on both platforms with persistent login and shared-account sync. (Store distribution / dev-program enrollment explicitly **not** in scope — §3.6.)

---

### M11 — Design System & Polish
**Status:** DONE, merged via PR #9 (`bf7d872`); 807 Vitest + 14 Playwright passing.

**Delivered:**
- Entry instants + editable time; register ordering by date, instant, id; local-calendar helpers.
- Structured logging, route/section boundaries, guarded async writes and Settings diagnostics.
- **"The Standing Register"** (§12): tinted paper/ink, rare full-strength iris, figure scale, marginalia/rules/leaders, tested AA token ramp, fixed motion budget and reduced-motion kill switch.
- One responsive shell: Home/Ledger/Inbox/More tabs below `lg`, full sidebar from `lg`, global quick-add FAB/sheet and command palette. All create/edit flows use `ResponsiveSheet`; inline compose bars are retired.
- Register history curve, carried balances, shared filters/sorts; responsive filtered list views.
- Fixed-order 16-widget dashboard registry with persisted global/per-widget periods, collapsible sections, derivations, charts and selected ledger deep links.
- User-directed category **icon** customization via a searchable curated Lucide picker. Existing auto/stored category colour rendering remains; no colour-picker UI. Plan/dashboard keep dots by deliberate scope.
- Skeletons, invitation empty states, first-run category onboarding, persistent sync-error banner, focus/a11y pass.
- Playwright: seven critical local-first flows on desktop Chrome and 390×844 mobile Chrome.

**Verification:** `npm test` (807), typecheck, lint, static build, touched-file Prettier and `npm run test:e2e` (14/14). User independently passed all 14 on 2026-07-23.

**Exit criteria:** Met. M10 Capacitor and post-M11 movable/visibility widget work remain separate.

---

## 5. Testing Strategy (cross-cutting)

- **Engine/logic (the bulk):** Vitest, pure functions in `src/core/`, no DOM. Every worked example in §5.9 and every derivation in §5.9.7/§6.8 becomes a named test. This is where financial correctness is guaranteed.
- **Data layer:** Vitest + `fake-indexeddb` — op idempotency (§8.2), replay equality, soft-delete integrity (§0.3).
- **Sync:** simulated two-client merge tests using in-memory `drivestore` fakes before touching real Drive; then a manual real-account integration pass at M9.
- **UI/e2e:** Playwright at M11 for the critical flows (log expense, transfer, create goal, approve inbox, view plan).
- **Property tests** for the two load-bearing invariants: the **balance identity** holds — `balance(c) = SUM(amount WHERE container_id=c) − SUM(amount WHERE to_container_id=c)` over approved, non-template rows (a naive `SUM(amount)` is wrong once transfers/templates/pending exist — §0.4); this requires transaction voids to be ledger events, not deletes (§0.3); and replaying a **totally-ordered** op set is idempotent — deduped by `id`. **Ops are not commutative** — convergence across devices depends on a defined total order (timestamp + `id`), *not* on id-keying alone, so the test must assert equality under the canonical order, not arbitrary permutations.

---

## 6. Parallel Non-Code Track (start during M0)

These have real-world lead time and gate M8–M10; begin them early so they're never the critical path:

1. **Google Cloud project + OAuth consent screen** in "Testing" status; add your own email as a test user (§3.2, §3.6). Free, no approval wait.
2. **Create the three OAuth client IDs**: Web SPA (needed for M8), iOS, Android (needed for M10) — all public clients, **no secret** (§3.1).
3. ✔ **Bundle ID `com.yaccount.app` — LOCKED FINAL** (§9). Register OAuth clients / listings against it.
4. **Privacy policy + verified domain** for the consent screen — **needed only to *publish*/verify the consent screen, NOT for "Testing" status** (which carries us through M10). Not an early-critical-path blocker; prepare it before leaving Testing (§3.2/§3.6, §10 #29).

---

## 7. Dependency Graph (at a glance)

**Dependency edges (what unblocks what):**
```
M0 ─▶ M1 ─▶ M2 ─▶ M3 ─▶ M4 ─▶ M5 ─▶ M7 ─▶ M10 ─▶ M11
              │      └──▶ M6 ──────────┘
(§6 track) ─▶ M8 ─▶ M9      (M9 also needs M1 op-log; M10 needs M9 + M8)
```
- M2 needs M1. M3 needs M2. **M4 needs only M2** (categories), not containers. M6 needs M3. M5 needs M4 (+M3). **M7 needs M5, M6.**
- M8 needs only the §6 track. **M9 needs M8 + the M1 op-log — nothing from M3–M7.** M10 needs M9 + M8's provider seam. M11 wraps everything.

**Recommended execution order (sync pulled EARLY — sync is a hard v1 gate, §9 Q1/Q7):**
```
M0 → M1 → M2 → M8 → M9 → M3 → M4 → M6 → M5 → M7 → M10 → M11
                  └── sync live from here; every later feature syncs for free (generic op-log) ──┘
```
Sync depends only on M1+M8, so once the core ledger (M2) gives real data to sync-test, we stand up auth (M8) + Drive sync (M9) immediately rather than last. The §6 Google Cloud track starts during M0 (it gates M8). Local-first (§8.6) keeps the dev loop fast even with sync wired — the app still runs fully offline against IndexedDB.

---

## 8. Explicitly Deferred (per spec, do NOT build in MVP)

- Native home-screen widgets (WidgetKit/native code) — §6.6, post-MVP; quick-add templates are the stand-in.
- Receipts/attachments, bank-feed integration, transaction splitting/multi-category — §7, out of scope.
- Multi-currency — §7/§10.5.
- Multi-account/household — §10.7.
- Savings-goal template + reminder convenience layer — §5.9.6/§10.8, non-blocking; core goal system doesn't depend on it.
- Goal spanning N containers — §5.9.2, rejected/deferred.
- Store distribution / paid dev-program enrollment — §3.6.

---

## 9. Unresolved Questions

1. ✔ **Build order — RESOLVED: pull sync EARLY.** Execution order is `M0→M1→M2→M8→M9→M3→M4→M6→M5→M7→M10→M11` (§7). Sync live right after the core ledger.
2. ✔ **Chart lib — RESOLVED.** Recharts everywhere; waterfall via stacked-bar + transparent base, custom SVG only as fallback.
3. ✔ **Category color — RESOLVED (hybrid).** Auto-palette by default (`color` null; resolved at render, ships M5); user-override UI deferred to M11. M2 stores null.
4. ✔ **Bundle ID — RESOLVED.** `com.yaccount.app` locked final; §6 OAuth clients register against it.
5. ✔ **Recurring lead-time — RESOLVED.** One-at-a-time locked; backfill by mode (fixed=all missed, goal_derived=one). See §5.8/M6.
6. ✔ **Snapshot-collapse cadence — RESOLVED.** Op-count threshold (~500 un-snapshotted ops) checked on boot (cheap counter; byte-size can't be measured without fetching — `list()` has no size). Any device collapses opportunistically; no election (snapshot derived). See §8.4.
7. ✔ **MVP definition — RESOLVED: M9 sync is MANDATORY for v1.** Local-only (M7 without M9) is not shippable. This is why sync is pulled early (§7, Q1).
8. ✔ **drivestore conditional write — ANSWERED: no.** `DriveFile` has no etag/version, `write` is unconditional, `append` non-atomic; Drive has no CAS. → per-device ledgers (§10 #19). Closed.

---

## 10. Adversarial-Review Corrections & Open Holes

Findings from an adversarial pass against `yaccount-tech-spec-v3.md` (source of truth). Items already patched inline above are marked ✔; the rest are holes this doc must close before the relevant milestone. Grouped by area.

### Balance / ledger semantics (root: single-row transfers)
1. ✔ **`balance = SUM(amount)` is wrong once transfers exist.** A transfer is one row keyed to the *source* `container_id`; the destination is credited only via `to_container_id`. Correct identity: `SUM(amount WHERE container_id=c) − SUM(amount WHERE to_container_id=c)`. Fixed in §0.4, §5, and spec §5.4.
2. ✔ **Same formula must exclude non-ledger rows** — `is_template = true` (§5.4) and `inbox_status = 'pending'` (§5.4) rows are in the `transactions` store but are not live balance. All balance/report/`contributed` queries filter `approved AND non-template`.
3. **`contributed` (§5.9.3, M7) must exclude *pending* transfers.** A goal auto-contribution lands pending and moves money only on approval (§5.9.5); counting it before approval inflates progress. `goals.ts` must window on approved transfers only.
4. **Reconstructed Balance Engine (M5, line ~200)** "± transfers in the gap" must use the same two-directional crediting (in via `to_container_id`, out via `container_id`) for the investment container — not a one-sided `SUM(amount)`.
5. ✔ **Transfer `amount` sign — RESOLVED.** Single row, stored **negative** (outflow on source `container_id`); destination credited via `to_container_id` in the §5.4 balance identity. Locked by that identity.
6. ✔ **`vendor_source` for transfers — RESOLVED.** Auto-synthesize `"{source} → {dest}"` from container names, user-editable; keeps `NOT NULL`. Same for `template_vendor_source` on transfer rules (§5.8). Recorded in spec §5.4.

### Goals / plan math (M7)
7. ✔ **÷0 at/after deadline — RESOLVED.** Guard added (spec §5.9.7 + M7): `whole_months_left ≤ 0 ⇒ ask = max(0, target − basis)` + re-plan prompt.
8–9. ✔ **`reserve` × `mode` — RESOLVED (Option B).** Reserve keeps its `mode`; every ask formula substitutes `basis = balance` for `contributed` (deadline spreads `(target−balance)/months_left`, fixed refills at M until `balance≥target`, passive $0; a withdrawal re-opens the ask). Spec §5.9.7 + §6.8 reworded; the old flat "current shortfall" is now just the deadline-now degenerate case.
10. ✔ **Open-ended `fixed` goal — RESOLVED.** No target ⇒ show "Open-ended": running total contributed only, no projected-completion date, no progress bar. Recorded in spec §5.9.7.
11. ✔ **Goal auto-create name collision — RESOLVED (reuse).** If a same-named container exists, reuse it as the new cycle (no rename/dupe); block only if it already has an active goal (0-or-1 rule). Fresh container only when none exists. Recorded in spec §5.9.2.
12. ✔ **`Income expected` (§6.8) — RESOLVED.** Locked: Σ active income recurring-rule occurrences for the month if any exist; else a user-entered figure. Recorded in spec §6.8 and M7.

### Data model / validation
13. ✔ **Sign ⟂ category type — RESOLVED (soft, M1).** No hard zod cross-field refinement (it would block voids/reversals/refunds, which must carry the opposite sign and net in-category). Instead: the entry UI pre-signs by type and confirms on mismatch; schema allows either sign. Recorded in spec §5.4.
14. ✔ **`budget_targets` uniqueness — RESOLVED (upsert).** Unique per `(category_id, start_date)`; `setBudgetTarget` upserts by that natural key in `apply()` (no hard IndexedDB unique index — it could throw on replay). Recorded in spec §5.3.
15. ✔ **`yearMonth` stored field — RESOLVED.** M1 transaction schema now materializes a stored `yearMonth` (derived from `date` at write); spec §8.3 says "STORED field." In scope.
16. ✔ **`by_container_month` index — RESOLVED.** Now explicitly created in M1's IndexedDB schema (alongside `by_container_category_month`); Container Flows (M5) reads it.

### Sequencing / sync
17. ✔ **Container Flows timing — RESOLVED.** View deferred to M5 (with the unified period control); M3 lands only the transfer data + `by_container_month` index. Updated in M3/M5 scope.
18. **"Sync bolts on with no re-architecture" is overstated (§0, M9).** M9 adds a total order, a concurrent-edit conflict policy (LWW), clock-skew tolerance, and a non-atomic-`append` workaround — real new design, not a no-op. The op-log spine reduces but doesn't eliminate sync work.
19. ✔ **Ledger layout — RESOLVED (Option B, after checking drivestore source).** Drivestore exposes **no conditional write** and Drive has **no atomic CAS / create-if-absent**, so Option A (single ledger + RMW) is not corruption-proof and a lock file isn't a reliable mutex. **Locked: per-device append-only ledgers** (`ledger_<deviceId>.json`), each device writes only its own, boot merges all under the total order. Spec §8.4/§8.5 rewritten; §9 Q8 closed.
20. ✔ **Rotation race — RESOLVED by #19.** With per-device ledgers each device truncates/archives only its own file → no cross-device rotation race. (Snapshot-write contention remains, but the snapshot is derived, so a raced snapshot is never data loss.)
21. ✔ **Local oplog rotation — RESOLVED (by #6/#19).** This device's local oplog = its own ledger; on collapse it truncates to post-snapshot ops. Full-replay tests hold because `snapshot + all ledgers` reconstruct state; M1's pre-sync replay test just runs against the single local log before any collapse exists.
22. ✔ **Backfill semantics — RESOLVED (by mode).** `fixed` backfills every missed month (oldest-first, at each due date); `goal_derived` collapses to one current occurrence at the self-corrected ask (no double-count). Recorded in spec §5.8 + M6.

### Merge-path holes found by the M3 adversarial audit (M9 must close these)
33. **The reducer cannot yet satisfy §8.6's "apply remote ops as a delta".** `replay` sorts by `compareOps`, but `Repo.dispatch` applies in arrival order and rows carry no version — so a late-arriving older `*.update`/`setting.set` would clobber a newer local edit (contra §8.5 LWW). M9 fix: buffer remote ops and apply under the total order (preferred — no model change), or add `updated_ts` per row and enforce LWW in the reducer. Local-only operation (M0–M8) is unaffected: the app always dispatches in ascending `ts`. Pinned by `repo.test.ts` "live state == replay(listOps())".
34. **The snapshot natural-key upsert can destroy a report the deleting device never saw** (see spec §8.5 note). Decide at M9 between keeping the delete-by-key upsert and deriving the row id from `(container_id, date)` so a same-day collision becomes an ordinary LWW `put`.
35. ✔ **`Repo.dispatch` had no rollback — FIXED at M3.** A throwing `applyOp` (e.g. an op type from a newer client) left the op in the journal because `oplog.put` had already committed, producing exactly the log/state desync the single transaction exists to prevent. Now wrapped in `try/catch` → `tx.abort()`. Regression-tested.

### Spec-attribution / accuracy
23. **Total order "timestamp + `id` tiebreak (§8.2)"** — §8.2 says "timestamped and UUID-keyed" but never defines a tiebreak/total order or LWW. This is *our* design; don't attribute it to §8.2.
24. **Void-as-`amount`-row correction mechanism (§0.3)** is our decision, not spec text — spec never specifies transaction correction. ✔ **M2: implemented + user-blessed** — the reversing row carries a nullable **`reverses_id`** FK → the original (spec §5.4 table updated). Distinguishes an intentional void (pair hidden from the ledger) from a genuine refund (both rows kept visible); the original is never mutated, so append-only (§0.3) holds and `balance = SUM(amount)` stays exact.
25. ✔ **Silent re-auth scope — FOLDED.** Re-consent fallback scoped for all browsers (not Safari-only); updated in M8 scope.
26. **`crypto.randomUUID` needs a secure context** (✔ noted in §1) — ensure the hosted web build is HTTPS.
27. ✔ **Integer-cents vs `REAL` — RESOLVED (M1).** Locked: persist integer cents everywhere (stores, ops, snapshot); decimal only at input/display edges. `REAL` is display-only. Recorded in §1.
28. ✔ **Waterfall in Recharts — RESOLVED.** Built as a stacked `BarChart` + transparent base series; stay on Recharts (no second lib), custom SVG only as fallback. Recorded in §1 + M5.
29. ✔ **Privacy-policy timing — FOLDED.** Reclassified: needed only to publish/leave "Testing," not early. Updated in §6 item 4.
30. **`auth/` folder "(added M8)" but `native.ts` is M10 work** — the folder spans M8 (web) → M10 (native); minor labeling.

### Tech-spec internal fixes applied (source of truth; corrected in place)
31. **`§5.10.x` cross-references pointed at the wrong section.** Savings Goals is **§5.9** (not §5.10 — §5.10 is the Edge-cases table). Fixed the intro (×3) and all body refs: `§5.10→§5.9`, `§5.10.1/.2→§5.9.2/.3`, `§5.10.4→§5.9.5`, `§5.10.5→§5.9.6`. This doc already used the correct §5.9.x throughout.
32. **Spec §5.4 balance formula** was internally inconsistent (single-row transfers vs "`SUM(amount)` trivially" vs §5.6 Net-Contributions crediting via `to_container_id`). Added an explicit "Balance computation" note to §5.4.

> **Net:** the load-bearing corrections are the balance identity (#1–#6) and the goal/plan math edge cases (#7–#12); most others are one-line hardening or scope re-labeling. None changes a *locked* product decision — they close under-specified mechanics the spec left implicit.
