# yaccount — Technical Specification (v3)

> **This document is the product contract:** what yaccount does and which rules may never
> regress. It describes current, shipped behavior. Architecture and code layout live in
> [`yaccount-implementation-details.md`](yaccount-implementation-details.md); current state and
> operational hazards live in [`HANDOFF.md`](HANDOFF.md). Where they disagree with this document,
> this document wins — except on shipped mechanics, where the code and tests are the truth.
>
> Every rule below is settled. Shortening or rephrasing one must not weaken it.

---

## 1. Product

**yaccount** is a personal finance app that replaces a budgeting spreadsheet ("The Measure of a
Plan v5"). It is more than a record of where money went: it exists to give **every dollar a
purpose before it is earned**. Income is allocated forward across steady spending categories and
accumulating savings goals until nothing is unassigned (§6.5).

It is fully decentralized: no app server, no database server. Data lives in the user's own Google
Drive `appDataFolder`, reached through the author's `drivestore` library, plus on-device
IndexedDB. Single currency.

Design tenets: never silently lose, move or overwrite a transaction, especially across
offline/multi-device use; no artificial scale limits (the spreadsheet's category, row and month
caps were column artifacts and are gone); a calm, exact visual language (§9).

### 1.1 Reversibility — the spine

**yaccount is a git-style ledger: every action is an append-only event, and every action the user
can take, they can take back.** This outranks convenience whenever the two collide. Three rules,
and no feature may violate them:

1. **Nothing is one-way.** If the UI offers an action, it offers its inverse. Archive ⇄
   unarchive. Delete a transaction ⇄ undo the delete. A reported balance can be edited or
   removed. A soft delete with no way back is a slow hard delete, and shipping one is a bug.
2. **The undo is itself an event, never an erasure.** Undo appends the compensating op; it never
   rewrites or removes a record. State is the replay of the journal under the total order (§7.1),
   so both the delete and its undo stay in history — `git revert`, not `git reset`. This is also
   what makes multi-device merge correct.
3. **Reversibility is visible, not merely possible.** Reconstructible-in-principle does not
   count. The user must see what they put away and click one control to bring it back: an
   Archived section, a Restore control, an **Undo action in the confirmation toast**.

Consequently: state-bearing flags are two-way ops, financial corrections are compensating rows
(never in-place edits of history), and the only hard deletes are non-financial housekeeping
(templates, a superseded budget target, a mistyped snapshot) — and even those are journaled ops.

---

## 2. Platform

**One build, three surfaces.** The same static export runs unwrapped in a desktop browser and,
later, inside Capacitor on iOS and Android. Layout reorganizes responsively; functionality, data
model and business logic are identical everywhere. There is no platform fork.

**Next.js in static-export mode** (`output: "export"`). Static export is what Capacitor wraps and
what a plain browser serves with no server. Next is kept over Vite to preserve the option of a
later server-integrated architecture without a framework rewrite.

**All storage must work in a plain browser context**, which fixes IndexedDB as the app-data store
on all three surfaces. Native secure storage is reserved for the native OAuth refresh token only.

### 2.1 Web delivery (current)

The browser build is deployed as the GitHub Pages project site
`https://somewhatmay.github.io/yaccount/`.

- Pages builds opt into `basePath`/`assetPrefix: "/yaccount"` via `YACCOUNT_GITHUB_PAGES=true`.
  Local development, Playwright and Capacitor stay rooted at `/`.
- `trailingSlash: true` emits a directory index per route, so extensionless deep links and hard
  refreshes work on static hosting.
- Pushes to `main` deploy only after Vitest, typecheck, lint and the static build pass.
- A Pages build **must fail before compilation** if `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID` is unset.

---

## 3. Authentication

There is no server, so yaccount registers as a **public OAuth client** — SPA (web) now, native
iOS/Android later. **No client secret is ever generated or required.** The only scope is
`https://www.googleapis.com/auth/drive.appdata`, which Google classifies as non-sensitive, so
only basic consent-screen verification applies — no sensitive-scope review, no CASA assessment.

**One seam.** An `AuthProvider` exposes `getAccessToken(): Promise<string>` and a silent-only
`getAccessTokenSilent()`. That callback is what `createDriveStore({ accessToken })` receives;
`drivestore` never learns the platform.

### 3.1 Web flow (current)

Google Identity Services' token client, `ux_mode: "popup"`. The browser has **no refresh token**,
and the GIS token client always needs a user gesture — there is no hidden-iframe silent renewal.
So auth state splits in two:

- A **durable `granted` flag** — the fact that the user connected their Google account. Persisted
  indefinitely; this is the user-facing "signed in" state.
- A **short-lived access token** (~1h), cached, renewed silently on demand during user activity,
  with an interactive re-consent fallback.

Net effect: connect once, stay connected. The popup returns only on explicit sign-out or genuine
session loss/revocation. Auth state lives in `localStorage` (durable grant + short-lived token
only — **never a refresh token**, which the web flow does not have), degrading to in-memory when
storage is blocked.

A background sync tick must use the silent-only call, so it can never raise a popup; a
**Reconnect** affordance is the one gesture that re-consents.

### 3.2 Native flow (deferred with M10)

iOS/Android client IDs, Authorization Code + PKCE through the **system browser** (never an
embedded webview, which Google blocks), redirecting to the custom scheme
`com.yaccount.app://oauth2redirect`. Native clients can hold a real refresh token, stored in
Keychain/Keystore — never in IndexedDB or `localStorage`. The resulting asymmetry (persistent
native login, periodic web re-approval) is accepted, not engineered around.

Bundle ID / package name / redirect scheme: **`com.yaccount.app` — locked final.**

---

## 4. Data model

The pattern is **Global Budgets / Local Containers**, plus a purpose layer. **Categories** carry
budgets — *what money does*. **Containers** are asset buckets — *where money lives*. **Goals**
are a purpose + plan over a container — *what a pool accumulates toward*. **These three axes are
independent and no code path may collapse them.**

Money persists as **integer cents** everywhere (stores, op payloads, snapshots). Dates are ISO
`YYYY-MM-DD` calendar strings. All ids are UUIDs.

### 4.1 `categories`

| Field | Type | Notes |
|---|---|---|
| id | TEXT (UUID) | PK |
| name | TEXT | unique, non-empty (trimmed, case-insensitive, NFC-normalized) |
| type | TEXT | `expense` \| `income` |
| is_archived | BOOLEAN | soft delete only (§4.4) |
| color | TEXT nullable | `null` = deterministic auto-palette at render; non-null = stored override |
| icon | TEXT nullable | a curated Lucide glyph name; absent/unknown falls back to the colour dot |

No category count cap.

### 4.2 `containers`

| Field | Type | Notes |
|---|---|---|
| id | TEXT (UUID) | PK; `'general'` is auto-created on first init as the default wallet |
| name | TEXT | unique, same rule as categories |
| is_investment | BOOLEAN | offers reported-value tracking (§4.5). Editable at any time. Orthogonal to whether a goal is attached |
| include_in_overall_balance | BOOLEAN | default **false**, except `'general'` (true) |
| is_archived | BOOLEAN | soft delete only |

- Balances may go negative; the UI renders them in rose rather than blocking the transaction.
- One container is the global **Default Spending Container** (a synced setting, default
  `'general'`), so routine logging never requires picking a container.
- Uniqueness is enforced at the point of entry, on create **and** rename — never in the reducer,
  because a merge must never throw.
- Archived containers stay valid FK targets, so historical charts and past goal cycles never
  break.
- A container may carry no goal, one active goal, or a history of completed goals.

### 4.3 `budget_targets` (time-variant, no end date)

| Field | Type | Notes |
|---|---|---|
| id | TEXT (UUID) | PK |
| category_id | TEXT | FK → categories |
| amount | cents | ≥ 0 |
| start_date | ISO date | effective until the next row for that category |

**Unique per `(category_id, start_date)`:** setting a budget on a date that already has a row
**upserts**. The reducer enforces this by natural key, so it survives device merges and "latest
row ≤ X" resolution stays unambiguous.

**Resolution:** the budget on date X is the latest row with `start_date ≤ X`. Historical reports
must evaluate against the budget active *at that time*, never the current one. Implicit end dates
support both permanent shifts and one-off anomalies with no end-date bookkeeping.

A budget target is a **flow** allowance; a goal contribution is a **stock** accumulation. They
are separate tables and meet only in the monthly plan (§6.5).

### 4.4 `transactions` — the unified ledger

Expenses, income, transfers, templates and recurring-pending rows all live here.

| Field | Type | Notes |
|---|---|---|
| id | TEXT (UUID) | PK |
| date | ISO date | |
| amount | cents | **negative = outflow, positive = inflow** |
| vendor_source | TEXT | payee or funding source; for transfers it defaults to a synthesized `"{source} → {dest}"` label, user-editable |
| category_id | TEXT nullable | null **only** for transfers |
| container_id | TEXT | source container / the account for a normal row |
| to_container_id | TEXT nullable | set **only** for transfers — the destination |
| is_template | BOOLEAN | true = a saved 1-tap shortcut, not a live ledger entry |
| template_name | TEXT nullable | shortcut display name |
| inbox_status | TEXT | `pending` \| `approved` (default) |
| recurring_rule_id | TEXT nullable | set on rows generated from a rule |
| notes | TEXT nullable | optional freeform detail, separate from `vendor_source`; blank normalizes to null |
| reverses_id | TEXT nullable | set **only on a reversing row** → the id of the row it cancels |
| yearMonth | TEXT | stored `YYYY-MM`, derived from `date` at write time, for the compound indexes |

**Three shapes** share the table: **expense/income** (`category_id` set, `to_container_id` null,
sign distinguishes them) and **transfer** (`category_id` null, `to_container_id` set).

**Balance — the load-bearing formula.** A transfer is a *single* row keyed to the source, so a
naive `SUM(amount)` debits the source and never credits the destination:

```
balance(c) = SUM(amount WHERE container_id    = c)
           − SUM(amount WHERE to_container_id = c)
   over rows WHERE inbox_status = 'approved' AND is_template = false
```

**Every derivation — balance, contributed, container flows, reconstructed balance — must apply
both caveats: the destination leg, and the approved/non-template filter.**

**Sign is a UI default, not a schema constraint.** The entry form pre-signs by category type and
confirms an unusual sign inline, but the data layer permits either sign on any category, because
voids and refunds legitimately carry the opposite sign and must net *within* their category. The
direction of money is a **visible `−`/`+` control**, never a typing convention; a typed sign
moves into that control rather than being silently absorbed.

**Expenses always render with an explicit minus sign**, not colour alone.

**Void = a reversing row.** There is no destructive delete of a transaction, and transactions
have **no `is_archived` field**. "Deleting" appends a same-fields, opposite-sign row whose
`reverses_id` points at the original. The pair nets to zero, the balance stays exact and
auditable, and the UI hides both. A genuine refund (`reverses_id = null`) stays visible as two
real events.

**A void is undoable** (§1.1): undo appends a row reversing the reversing row. A row is live iff
no **still-live** row reverses it — a chain walk, not a one-step check, and cyclic
`reverses_id` must resolve deterministically so two devices agree about what is on screen. A
pending or template row can never hide a live row. Balances need none of this: every reversal is
a real signed amount.

**Transfers are structurally distinct** and excluded from category expense/income reporting —
nothing left the user's possession. A dedicated Container Flows view reports net in/out per
container. This distinction is load-bearing for goals: a transfer into a goal container is a
*contribution*; an expense out of it is *spending on purpose* (§4.6).

### 4.5 Deletion policy, and container asset tracking

**Categories, containers and goals are archived, never hard-deleted**, and archiving is always
reversible: every screen that archives must list what is archived, offer one-click Restore, and
put an Undo in the toast. Restoring is lossless — only the flag flips.

**`container_snapshots`** record the real-world value of an investment container:

| Field | Type | Notes |
|---|---|---|
| id | TEXT (UUID) | PK |
| container_id | TEXT | FK → containers |
| date | ISO date | **unique per `(container_id, date)`** — one report per container per day |
| reported_balance | cents | the value at that moment |

Only actual cash movement in or out is logged, as an ordinary transfer. **Market growth is never
a transaction.**

```
Net Contributions    = Σ transfers into the container − Σ transfers out
Current Value        = latest reported_balance
Unrealized Gain/Loss = Current Value − Net Contributions
```

**Net Contributions is the general savings-progress primitive**, not an investment-only one: it
is exactly what a `spend_down` goal measures against (§4.6). This is why the goal system adds
almost no new accounting concept.

**One report per container per day.** Logging or editing onto an occupied day replaces it; two
readings of one account on one day are a mistake, not history, and "current value = latest
report" must never be ambiguous. Enforced by natural-key upsert in the reducer so it survives
merges. No hard IndexedDB unique index — it could throw on replay.

**Snapshots are correctable observations.** A snapshot is a value the user typed after looking at
their account, not a money movement — nothing derives a balance from it — so unlike a
transaction it may be edited in place or removed, and each container shows the full history of
its reports with Edit/Delete. This does not weaken the never-lose-data rule: record, update and
remove are all journaled ops, and state is their replay.

**Reconstructed balance** fills historical gaps as `nearest known snapshot ± transfers in the
gap`, using the same two-directional crediting as the balance formula. Rolls forward from a past
snapshot or backward from a future one. Chosen over carry-forward, which ignores transfers during
un-snapshotted periods and produces false cliffs.

### 4.6 Savings goals

A goal is a purpose + plan layered onto a container. Containers stay dumb buckets; a goal is the
intention that fills one.

**Progress is contributions, not balance.** Buying a $20 shirt from a fully funded $200 clothing
fund must not conclude "you are $20 short." Only **transfers** move progress: in is a
contribution, out is a reallocation away. **Expenses never affect progress** — spending on the
purpose fulfills the goal. Spendable balance is always shown *alongside* contributed, never as
the driver ("set aside $200 · $180 available").

#### `goals`

| Field | Type | Notes |
|---|---|---|
| id | TEXT (UUID) | PK |
| container_id | TEXT | FK → containers. **At most one `active` goal per container** (app-level); unlimited historical ones |
| name | TEXT nullable | cycle label; defaults to the container name |
| kind | TEXT | `spend_down` (default) \| `reserve` |
| mode | TEXT | `deadline` \| `fixed` \| `passive` |
| target_amount | cents nullable | required for `deadline` and `reserve`; optional for `fixed`/`passive` |
| deadline | ISO date nullable | required when `mode = deadline` |
| planned_monthly | cents nullable | the committed monthly M for `fixed`; **null for non-fixed modes** |
| opening_contributed | cents | head-start basis at cycle creation (absorb-leftover) |
| status | TEXT | `active` \| `completed` \| `cancelled` |
| is_archived | BOOLEAN | soft-hide only |
| created_date | ISO date | cycle start; the anchor for contribution windowing |
| completed_date | ISO date nullable | |

**Cardinality:** a container has 0-or-1 active goal and any number of historical ones; a goal has
exactly one container. Creating a goal may **auto-create its container**. On name collision,
**reuse** the existing container as the next cycle — unless it already has an active goal, in
which case block. Rejected: N active goals per container (a transfer into the shared bucket
cannot be attributed), and one goal spanning N containers (deferred).

#### Two kinds

**`spend_down` — progress = contributions.** The money exists to be spent on its purpose;
spending fulfills the goal and must never reopen it.

```
contributed = opening_contributed
            + Σ transfers INTO the container − Σ transfers OUT,
              over approved transfers dated ≥ created_date
progress    = contributed / target_amount        (may exceed 100%)
```

**`reserve` — progress = balance.** The money exists to *stay* (emergency fund, buffer), so
spending *should* reopen the goal and progress follows live balance, display-capped at 100%. No
windowing, no `opening_contributed`: it is a set-point, not a cycle.

The same withdrawal that leaves a spend-down goal complete reopens a reserve goal. `is_investment`
is orthogonal to `kind`.

#### Three planning modes

`mode` holds one quantity fixed and lets the complementary one flex. A goal may never commit to a
hard monthly *and* a hard date at once; the complementary figure is shown but advisory.

- **`deadline` (recommended) — the date is sacred, the ask flexes.**
  `required_monthly = max(0, (target − basis) / whole_months_until_deadline)`, current month
  inclusive, where `basis = contributed` for spend_down and `balance` for reserve. Money rounds
  **up**, so the target is never reached a cent short. Miss a month → next month's ask rises
  automatically. Overshoot → the ask falls to $0 early. **Guard:** at or past the deadline
  (`whole_months ≤ 0`) the ask is the full remaining `max(0, target − basis)` — never a division
  by zero — plus an explicit **re-plan** prompt. The app never silently smooths the number and
  never auto-moves the goalpost.
- **`fixed` — the ask is sacred, the date flexes.** M is constant; under/overpaying slides the
  projected completion date. Target optional (open-ended). Open-ended shows a running total only:
  no projected date, no progress bar, since both need a target.
- **`passive` — tracked, claims nothing.** No ask, $0 in the monthly plan, a progress bar if a
  target is set.

The self-correcting deadline ask *is* the accountability; a separate frozen adherence baseline
was considered and cut as redundant. Granularity is whole-month, current month inclusive; there
is no sub-monthly goal type.

#### Contributions and automation

A contribution **is** a transfer into the goal's container — no new transaction type — and
automation **reuses `recurring_rules`** rather than adding a parallel scheduler.

- A goal may opt in to auto-contribution, creating a linked recurring **transfer** rule.
- `fixed` goal → `amount_mode = 'fixed'`, `template_amount = M`.
- `deadline` goal → `amount_mode = 'goal_derived'`: the rule resolves `required_monthly` from the
  linked goal **at generation time**, so a drifting ask never logs stale. This is the one
  genuinely new engine behavior the goal system introduces.
- Every generated contribution lands **pending** and moves money only on approval — never a
  silent auto-transfer.
- Completing or cancelling the goal cancels the rule; a resolved ask of $0 generates nothing but
  still advances the cursor. No orphaned auto-transfers.

#### Lifecycle

**Recurrence is emergent, not scheduled.** The container is the persistent theme; each goal row
is one independent cycle, so cycles may differ arbitrarily or be skipped with no reconciliation
and no lost history. That is precisely why goals are a separate table rather than fields on the
container. There is no auto-spawn cadence.

- **`spend_down` completes and closes** once `contributed ≥ target`: the ask drops to $0, the
  linked rule cancels, and it stays visible as achieved until the user archives it.
- **`reserve` completes but oscillates** — never terminal. Any withdrawal silently reopens the
  shortfall.
- **Over-contribution** past target is allowed and shown above 100%, never blocked or capped.
- **Cancellation ends the goal only and never moves money**; the balance stays in the container.
- **Leftover absorb** (default on): starting a cycle on a container that still holds a balance
  offers to set `opening_contributed` to it. Declining leaves the residue unattributed; it is
  never auto-swept.

---

## 5. Persistence and sync

### 5.1 The op-log

**Every persisted mutation is an idempotent op** `{ id, ts, type, payload }`, appended to an
append-only journal **and** applied to IndexedDB materialized state **in a single IndexedDB
transaction**. Replaying an op twice is a no-op. State *is* `replay(listOps())` under the
canonical total order (`ts`, then `id`), with last-writer-wins for concurrent edits to the same
entity.

Ops are not commutative — convergence depends on that total order, not on id-keying alone.

Materialized tables are a cache of the journal. Persisted tables are only: `categories`,
`containers`, `budget_targets`, `transactions`, `container_snapshots`, `recurring_rules`, `goals`
plus a synced `settings` key/value store. **Balances, contributions, progress, dashboards and the
monthly plan are computed on demand and never stored.** Caching a balance as state is a bug.

### 5.2 Local-first boot

**The app opens instantly from the local IndexedDB cache and never blocks boot on the network.**
Logging a transaction or checking a balance must work in the first frame. Sync is always a
background task behind a non-intrusive indicator, never a blocking spinner.

Only a genuinely fresh install (no local cache) shows a one-time download state.

Edits made *during* a sync go to local state and this device's queue as normal. Arriving remote
ops apply as a **delta on top of live state** — idempotent by id, replayed under the canonical
order — **never a wholesale replace**. The UI re-derives reactively when sync settles.

### 5.3 The Drive protocol — per-device ledgers

**Why per-device:** Drive AppData offers no atomic primitive that makes a single shared ledger
safe — no conditional write, no compare-and-swap, no guaranteed create-if-absent, and `append` is
non-atomic. The only design with a hard never-lose-a-write guarantee is to ensure **no two
devices ever write the same file.**

Drive layout:

- **`snapshot.json`** — a consolidated replayable **op set**, not a row dump. Derived, so a
  botched or raced write is never data loss.
- **`ledger_<deviceId>.json`** — one append-only JSONL op log per device. **Each device appends
  only to its own file.** A torn trailing line from an interrupted append is skipped, not thrown
  on.
- **`ledger_<deviceId>_<YYYY-MM>.json`** — dated pre-collapse archives, the permanent audit trail.
- **`origin.json`** — the reset generation (§5.5).
- **`backup_*` / `orphan_*`** — inert retired worlds (§5.5), listed by Settings, never read by
  sync.

**Sync cycle:** pull the snapshot and all live ledgers → merge → push this device's queued ops to
its own ledger → collapse when un-snapshotted ops exceed the threshold (~500) → truncate this
device's ledger to post-snapshot ops. Collapse archives every live ledger and writes a fresh
snapshot. **Any device may collapse opportunistically** — the snapshot is derived, so a double
collapse is redundant work, never data loss. A missing root (a fresh account) reads as empty.

**The local IndexedDB op-log is never truncated on collapse** — only the Drive ledgers are. This
keeps the replay invariant and a full local audit trail.

### 5.4 Merge rules

- **The merge replays the union of local and remote ops under the canonical order**, rebuilding
  materialized state. Sorting by arrival order would let a late older update clobber a newer local
  edit. Because the union includes local ops, it behaves as a delta on live state, not a replace.
- **A device writes only its own ledger.** Remote ops merged in are never re-queued for push.
- **An unknown op type from a newer client is dropped, not journaled**, so it cannot wedge sync.
- Concurrent edits to the same entity resolve last-writer-wins by (`ts`, `id`). A rare visible
  overwrite of a just-made edit is the accepted trade-off.

### 5.5 Data tools: export, import, clear, rollback

**The portable format is an op set**: `{format:"yaccount.export", version:1, exportedAt,
appDbVersion, deviceId, opCount, ops}`. Since state *is* the replay of the journal, the journal is
the only representation that restores identical state while preserving the replay invariant — and
it is the same primitive the snapshot uses, so export, import, merge and collapse all speak one
language. `deviceId` is provenance only and is **never imported**: two devices sharing a ledger
name would break the no-lost-write guarantee. Browser-local display preferences are not exported.
Synced settings, including dashboard layout, are part of the journal and portable format.

**An import is validated in full before anything is mutated, anywhere.** Envelope → every op's
shape (id, ISO `ts`, a *known* op type, object payload, no duplicate ids) → a complete replay into
throwaway memory → every resulting row against its table schema. A file failing any stage changes
nothing locally and nothing on Drive, and the failure names the offending row. A file declaring a
newer format version is refused rather than guessed at.

**Nothing is deleted; the app stops reading it.** Clear, import and rollback each retire the
entire current world (snapshot + all live ledgers) to `backup_<ts>_<kind>.json` *before*
overwriting, and **abort if the store cannot be fully enumerated** — a transient failure must
never read as an empty store and skip the backup. The only removals are live ledgers whose ops
were just copied into that backup; dated archives are never touched. Retired worlds are offered
back in Settings, and a rollback retires the present world first, so it too has an inverse.

**Ordering:** Drive first (retire → new snapshot → drop live ledgers → `origin.json` last as the
commit point), then the local half in a single IndexedDB transaction. Every intermediate state is
non-lossy — a crash mid-way leaves other devices merging a superset, never a hole — so **retry is
the recovery**, and a crash after the Drive commit self-heals when that device adopts its own
reset.

**The reset generation — `origin.json`.** A reset is a deliberate discontinuity, and Drive cannot
express one: an emptied store looks exactly like a brand-new Google account, which is a legitimate
first connect. So a reset writes `origin.json = {v, resetId, resetAt, kind}` and each device
records the last id it saw in device-local metadata.

- A device that **has synced before** and reads a *different* `resetId` **adopts** it: its own
  journal is set aside to `orphan_<deviceId>_<ts>.json`, local state is reset, and the ordinary
  pull refills it. Offline edits are preserved, not replayed — replaying would resurrect what was
  discarded — and are surfaced as a persistent Settings notice with Download and Roll back.
- A device that has **never synced** merges as always: nothing was reset out from under it.

**Only a positive reading may ever be acted on.** A failed Drive read resolves to *"could not
tell"*, never *"absent"*, and **a device never forgets a generation it holds.** This is not
hypothetical: conflating the two shipped briefly and made every offline tick forget the
generation and every reconnect re-adopt, setting the device's data aside each time. The same rule
covers enumeration before a backup: probe, then abort rather than guess. **In a store with no
atomic primitives, silence is not an answer.**

**These acts have no toast-sized undo, so they are confirmed by typing a word.** The Drive
consequence is stated in the copy before execution, and reads differently when the account is not
connected.

> Retired files live in the hidden `appDataFolder`, which the user cannot browse. Retired data is
> recoverable *through the app*; the export file is the only copy they can open themselves.

---

## 6. Reporting

### 6.1 One reporting period

A single shared global period control — Last month / 3 / 6 / 12 months / Year to date / All /
Custom — with a **per-widget override** where a report needs its own window, and **two-range
compare** folded into the same control rather than a separate page. Presets are rolling from
today. The global period, the comparison and every widget override persist as **device-local view
preferences**; they never enter the financial op log.

### 6.2 Rules the spreadsheet got wrong

- **Genuine zero-filtering:** categories with no spend in the active period are omitted from
  category charts entirely.
- **"Monthly Average" is scoped to the active period**, not all-time.
- Unused-category dimming does not apply — it was a fixed-width-array artifact.

### 6.3 Chart inventory

Kept as distinct types: category breakdown doughnuts (expense + income, zero-filtered, period
total and monthly average); monthly bars (income/expense/savings) with a budget-target overlay; a
single-category drill-down against its time-variant budget; and an **Income → Expenses → Savings
waterfall**, kept as its own chart type.

Category colour in charts reuses the one category swatch scheme; all other chart colour comes
from semantic tokens.

### 6.4 Quick-add shortcuts

Native home-screen widgets are deferred. The in-app "save as shortcut" 1-tap quick-log flow is the
near-term substitute.

### 6.5 The Monthly Allocation Plan

The product thesis made mechanical — a live, entirely view-time-derived statement for the active
month:

```
  Income expected
− Σ category allowances   (active budget targets this month)     ← flow
− Σ goal asks             (per mode)                             ← stock
= Unallocated
```

**Income expected:** if active **income** recurring rules cover the month, it is the sum of their
scheduled occurrences; otherwise a user-entered figure for the month. Recurring wins when
present; manual is the fallback.

Goal asks are per mode: `deadline` → the self-correcting `required_monthly`; `fixed` → M;
`passive` → $0. Reserve goals use the same formulas against `balance`, so a withdrawal reopens
the ask.

**Flow vs. stock** is what keeps budgets and goals separate entities yet unites them here. A
category budget is *flow*: a steady allowance, spent as earned, no accumulation, no completion. A
goal is *stock*: it accumulates, discharges in a burst, completes, and may recur irregularly. The
tell is accumulation — a sinking fund for an annual expense is a **goal**, not a category budget,
because as a budget the payment month would misread as a 12× overspend.

- **Over-allocation** drives Unallocated negative and renders it in rose — **flagged, never
  blocked**.
- **Unallocated is a computed number, not a container.** Leftover sits in `general` as genuinely
  uncommitted money and is **never auto-swept** — auto-assigning would violate "you decide every
  dollar's purpose."

### 6.6 Recurring generation

**One pending occurrence at a time, as it comes due** — never a batch of future rows, because
real prices drift and a monthly charge must not silently auto-log at a stale amount. Pending rows
are excluded from every dashboard, balance and budget calculation until approved, and live only
in the **Inbox**, which supports 1-tap and multi-select bulk approve (and bulk dismiss, with a
batch undo).

**`recurring_rules`** can express any of the three transaction shapes. `interval_config` is
discriminated by frequency:

- `daily` — no config
- `weekly` — `{ day_of_week }`
- `biweekly` — **twice a month**, two day-of-month anchors (e.g. 1st and 15th) — deliberately not
  a strict 14-day cadence; use `custom` for that
- `monthly` — `{ day_of_month }`
- `annually` — `{ month, day }`
- `custom` — `{ every, unit }`

Monthly and annual rules **anchor on the configured day and clamp per month** (Jan 31 → Feb 28 →
recovers to Mar 31) rather than chaining clamped dates. `next_generation_date` is a lower-bound
cursor only; the engine snaps it onto the occurrence grid.

**Backfill of occurrences missed while the app was closed** depends on `amount_mode`:

- **`fixed`** → every missed occurrence, oldest first, each at its own due date. Those charges
  really happened and are never silently skipped.
- **`goal_derived`** → a **single** current occurrence at the already-self-corrected ask. Stacking
  one per missed month would double-count.

Generation is idempotent: an occurrence row's id is deterministic from its rule and due date, so
regeneration never duplicates.

**Editing a rule is forward-looking:** the cursor resets to the first occurrence on or after
today rather than being preserved, since a preserved past cursor could mass-backfill on a
frequency change. Already-generated rows are left as independent proposals.

**Cancelling a rule is soft and reversible** (`status: active | cancelled`), with a Paused section
and a Resume control.

**Templates** (`is_template = true`) are saved 1-tap shortcuts created from any transaction. They
are uncapped and are not ledger entries.

---

## 7. Storage internals

### 7.1 IndexedDB

Nine object stores: the seven tables plus synced `settings`, and infra stores `oplog`,
`app_meta` (device-local, never synced — holds the `deviceId` and the last-seen reset generation)
and `outbox` (device-local op ids authored here and pending push). **`DB_VERSION = 3`.**

Two transaction indexes: `by_container_category_month` and `by_container_month`. The first
**excludes transfers** — their `category_id` is null and IndexedDB drops records with a null
key-path component — so Container Flows reads the second.

**Every schema upgrade must be guarded per store**, so bumping the version never drops a
populated local cache.

### 7.2 Rejected storage alternatives

Recorded so they are not revisited: **SQLite WASM + OPFS** (iOS Safari kills OPFS in private
browsing and evicts it after 7–14 days; needs COOP/COEP; exclusive worker lock causes
`SQLITE_BUSY`), the **SQLite session extension** (conflict resolution expects an interactive
callback and a live engine on the far end), and **CRDT sync libraries** (all require a live
network endpoint, incompatible with a flat-file serverless store).

---

## 8. Out of scope / deferred

- **M10 Capacitor native packaging** and the native OAuth flow (§3.2).
- **Native home-screen widgets** (WidgetKit and equivalent).
- Receipts and attachments, bank-feed integration, transaction splitting / multi-category tagging.
- Multi-currency. Multi-account / household support.
- A goal spanning multiple containers.
- The optional savings-goal template + reminder convenience layer. The core goal system does not
  depend on it.
- Store distribution and paid developer-program enrollment.

---

## 9. Visual design language — "The Standing Register"

> **This is law, not a mood board.** Every screen obeys it. If a design instinct conflicts with
> what is written here, the language wins — change *this section by explicit decision*, never
> drift in a component.

### 9.1 The thesis

yaccount is **a paper ledger a designer fell in love with** — calm, exact, columnar. Money is
quiet and precise by default, with exactly **one warm spark** (iris) and a single positive accent
(emerald) for money coming in. It is the deliberate opposite of two clichés it rejects: the cold
blue-grey fintech dashboard, and the alarm-clock red/green spreadsheet. **Restraint is the
brand.** Numbers are the hero; chrome recedes.

The boldness is spent on exactly three things and nowhere else:

1. **Paper and ink tinted with the brand hue** — every neutral carries a trace of iris, so the
   app never reads as default grey. Iris itself is used at full strength and rarely.
2. **The figure standing on its own history** — the hero balance sits on a faint area curve of its
   trailing series.
3. **The carried balance** — sticky day headers print the running balance as of that day, the way
   a paper check register carries a balance down the page.

### 9.2 Colour

Semantic tokens only, defined in `src/app/globals.css`, expressed in `oklch`. Never raw hex in a
component.

| Token | Job |
|---|---|
| `--brand` / `--primary` / `--ring` | **Iris at full strength.** The quick-add FAB, the active tab, focus rings, primary buttons. Rare by design — if iris is everywhere it is nowhere. |
| `--positive` (`text-positive`) | **Emerald. Money in only.** Never decorative. |
| `--destructive` | **Rose.** Genuine danger and true-negative only — never the default colour of an expense. |
| neutral base | Tinted paper (light) and tinted ink, not black (dark), at the brand hue. |
| `--surface-sunken` | A recessed plane: day headers, filter rails, a totals footer. |
| `--rule` | The hairline above a total and the dots of a leader. Reads harder than `--border`: a rule is punctuation, not a divider. |

**Hard rules:** expenses are **neutral** — they are the norm, and the explicit minus sign carries
the meaning. Only inflow is emerald; only true-negative is rose. Do not colour the ledger
green/red, and do not add a third accent hue without editing this table. **Tone is chosen by the
caller, never inferred from a number's sign** — a positive figure may be a refund, a transfer leg
or a balance, and colouring those emerald turns the one meaningful accent into decoration.

**Legibility is enforced, not eyeballed.** Every pair a user reads clears WCAG AA (4.5:1) in both
themes and the focus ring clears 3:1; a test parses the token ramp and asserts it, and also
asserts the ramp stays tinted.

**Category identity is one colour scheme, optionally carrying an icon.** Colour comes from the
stored `Category.color` when present, otherwise a deterministic hue from the id; never invent a
second swatch scheme. `Category.icon` may name one curated Lucide glyph rendered in that colour,
picked from a searchable sheet; no icon falls back to the dot. Icons appear in category, ledger,
inbox and recurring rows and in category selects. The Plan and dashboard keep dots. **There is no
colour-picker UI.**

### 9.3 Typography

Three roles, and only three:

| Role | Face | Where |
|---|---|---|
| Display | **Fraunces** (variable: `opsz`/`SOFT`/`WONK`, plus italic) | Balance hero, page headings, the wordmark. Display moments only — never body copy or labels. |
| Body / UI | **Geist** | All labels, inputs, buttons, secondary text. |
| Numerals | **Geist Mono** + `.tnum` | **Every monetary amount, everywhere**, plus counts. |

Never set an amount in the body sans; never set body copy in Fraunces.

**The figure scale** cuts Fraunces for size rather than scaling it — each step sets its own
optical size, softness and tracking, all fluid and tabular. `.figure-hero` is the one balance
moment per screen (never two); `.figure-lg` is a page title or secondary figure; `.figure-md` is a
total or card headline. `WONK` alternates are allowed only at hero size.

**`.marginalia`** — the accountant's pencil note, Fraunces italic between light guillemets. A
short aside saying something the figure cannot say about itself ("up $312 on last month"). Never
a label, never a heading, never a value you must read precisely. More than two on a screen means
they have become labels.

**`.eyebrow`** — the one label style. Uppercase, muted, one tracking everywhere. An eyebrow that
varies per screen is noise wearing a label's clothes.

### 9.4 Layout and shape

- **Column, not dashboard.** One centred reading column at every width, generous vertical rhythm.
  The dashboard is the one multi-metric screen permitted to widen.
- **Soft containers.** `rounded-2xl` bordered card surfaces, `rounded-xl`/`lg` controls, pills for
  nav and toggles.
- **The balance hero.** Each primary screen opens with a big Fraunces figure, a tiny eyebrow, and
  quiet marginalia — never a busy stat-card row.
- **Creating opens a sheet. The compose bar is retired.** Every "new" flow opens a
  `ResponsiveSheet` from a single **New** action in the page header, or from the quick-add FAB for
  a transaction. One surface for making things, on every screen and at every width. *An inline
  iris-tinted compose bar was used through M11 and retired after the user ran both side by side:
  a screen where some records are made in a bar and others in a panel teaches the reader nothing
  about either, and a one-line bar can never hold the third field a real record needs.*
  `border-primary/15 bg-primary/[0.04]` is no longer a pattern in this app.
- **The page header.** An eyebrow naming the screen, a `.figure-lg` title, one line of lede, and
  the screen's single **New** action **on the eyebrow's line, never the title's** — beside a fluid
  serif heading a button competes for the same 350px and the block reads as cramped.
- **Register rows, date-grouped.** `[dot or icon] [payee + category] ……… [mono amount] [⋯]`, with
  quiet dividers and right-aligned mono money.
- **The day header carries the balance** — an eyebrow on `--surface-sunken`, sticky, printing the
  running overall balance as of that day. **Hide the carried figure whenever a filter is active:**
  a filtered list's rows no longer explain the number.
- **Sticky rows require `overflow-clip`, not `overflow-hidden`** — `hidden` creates a scroll
  container and traps the sticky child against a box that never scrolls.
- **The rule is punctuation.** A hairline is drawn **only immediately above a total**, meaning
  "this sums the above"; a double rule marks a terminal total. Never a divider. A total is printed
  **under** the rows it sums.
- **Dot leaders** rail the eye from a name to its amount in **sparse summary lists only** — never
  in the dense register.
- **Responsive density.** Below `sm` a sheet rises from the bottom; from `sm` it slides in from
  the right — same component, one rule. Tables collapse to card rows below `sm`. No horizontal
  page scroll, ever.
- **One navigation registry, two shells.** Below `lg`, fixed bottom tabs: **Home · Ledger · Goals
  · More**. Inbox and its pending count live in the sticky topbar beside global Search; More holds
  the remaining destinations and Settings. From `lg`, a sidebar rail shows every destination with
  Settings in its footer; Inbox and Search remain in the topbar. The active destination is marked
  by full-strength iris on icon and label, never a tinted plate. **Routes are stable at every
  breakpoint:** `/` is the dashboard, `/ledger` is the ledger. The quick-add FAB is present at
  every width.
- **Appearance belongs in Settings.** System, Light and Dark are explicit choices there; no theme
  switch is duplicated in the topbar, More or command search. The policy is device-local through
  `next-themes`, not synced financial/account state.
- **Dashboard = an ordered widget registry** of stable ids. The synced layout setting reorders and
  hides registry entries; Overall balance is always visible and first. Cards edit directly in
  place, with hidden reports available through a descriptive gallery. Secondary widgets fold;
  fold state and any period override persist in the browser per id. Numbers identifying an honest
  ledger subset use real `/ledger` deep links; summaries and ambiguous chart marks do not pretend
  to be links.
- **Row actions hide until hover — but only where there is a hover.** A touch device has none, so
  the hiding is scoped to hover-capable pointers, and the whole control lives in one place
  (`RowActions`). Reading this rule literally once left phones with no row actions at all.
- **Editing opens a sheet, never a mode-swap.** Rule of thumb: **create = sheet, edit = sheet,
  confirm-destructive = AlertDialog** — with single-field rename the one inline exception (§9.5).
  Never repurpose a create surface into an edit form in place. **A destructive act with no undo
  waiting in the toast asks the user to type a word first** (`ConfirmDestructive`) — reserved for
  acts that replace or stand down the whole account (§5.5); everything reversible keeps the
  ordinary two-button confirm, because a phrase gate on a recoverable act is friction pretending
  to be safety.
- **Secondary sections fold.** Archived and paused sections are collapsed by default, with the
  **count visible in the header** — §1.1 requires the inverse to stay on screen, and "Archived · 3"
  satisfies that while three rows of it do not earn the space.
- **Shortcuts live in the quick-add sheet only** — not as a strip on the ledger.

### 9.5 Editing existing records

- **Inline rename** uses an explicit ✓/✗ pair plus Enter/Escape. **Blur never commits**; an empty
  name cancels. Committing by accident is worse than one extra click.
- **A record with history gets a history list, not a write-only form.** Anything loggable
  repeatedly shows its past entries in the same sheet, each with an Edit/Delete menu.
- **The direction of money is a visible `−`/`+` control** defaulting to the category's direction.
  A typed sign moves into the control. This is what makes a refund discoverable.
- **Toggleable menu entries are checkbox items** with the indicator in the **leading** icon
  column, its space reserved so the label never shifts. Never an always-on check icon.
- **Every field on a create sheet reads: label → segmented pair → one line of meaning**, default
  option leftmost. A container's counted-in-overall-balance choice is made at create time this
  way, defaulting to **not counted** — the opt-in model is untouched, only the visibility of the
  choice changed.

### 9.6 Interaction and motion

- **Motion is a whisper**, and it has a budget: **three durations, one curve**. 120ms for a colour
  under the pointer, 200ms for a row landing, 260ms for a surface arriving, all on one
  register-settling easing that leaves fast, lands slow and never overshoots. Anything needing a
  fourth duration or a second curve is asking for motion the language does not have. Press
  feedback is a colour change, not a scale.
- **Exactly one orchestrated moment, and it is quick-add:** tap the FAB → the sheet rises → you
  log → the row lands in the register with a single iris wash. A second orchestrated moment would
  make both ordinary. The FAB carries a compact dollar-plus mark, keeps the accessible name "Log a
  transaction", opens Expense on a quick press, and on a 500ms hold opens an
  Expense/Income/Transfer chooser. Movement beyond 10px, pointer cancellation, lost capture and
  Escape all cancel the press, and a release after a hold never also fires Expense.
- **Reduced motion is a kill switch, not a suggestion** — `prefers-reduced-motion: reduce` zeroes
  every transition and animation globally. Nothing here needs to move to be usable.
- **Feedback is toasts**, one per create/update/delete. Below `lg` they enter from the top,
  offset below the top bar with safe-area inset; desktop keeps bottom-right.
- **Soft rules stay soft and inline.** The unusual-sign check is an inline arm-then-confirm, never
  a blocking modal. Warnings guide; they never block.
- **Quality floor:** responsive to mobile, visible keyboard focus, an `aria-label` on every
  icon-only control.

### 9.7 Voice

Sentence case everywhere. Plain verbs. Write from the user's side of the screen. A control keeps
its word through the flow ("Save changes" → "Transaction updated"). Empty states are invitations,
not mood. Errors are specific and blameless. No system vocabulary ("row", "op", "dispatch") in
the UI.

### 9.8 How to extend

Reach for a **shadcn/ui** component first; hand-roll only when none exists, and match this
language when you do. Semantic tokens only. Amounts in `font-mono` + `.tnum`. New section headers
in Fraunces.

**Compose the language; do not re-derive it.** Every device above exists as a primitive in
`src/features/ui/`. If you are hand-rolling an eyebrow, a total, a money span, a page header or a
row's `⋯` menu out of Tailwind classes, the primitive already exists and you are forking the
language. Extending the system means adding a primitive **and** the sentence here that says what
it is for. Before adding decoration, remove one thing first. If a screen has two loud ideas, one
of them is wrong.
