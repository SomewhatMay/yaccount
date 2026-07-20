# yaccount — Technical Specification (Living Document, v3)

> **Status:** Third compaction checkpoint. Supersedes v2. Consolidates every decision locked in through three grilling rounds into a single coherent document: the full MVP source spec ("The Measure of a Plan v5"), the Capacitor/Next.js platform pivot, the OAuth architecture, the local-storage/sync design, and the complete **Savings Goals** system (§5.9) with its unified monthly allocation plan (§6.8). Open questions are collected in §10 so future sessions know exactly where to resume. Nothing below should be treated as final until implementation begins — this is the current shared understanding, not a frozen contract.

---

## 1. Product Overview

**Name:** yaccount (working bundle ID placeholder: `com.yaccount.app` — not yet finalized, see §9).

**What it is:** A personal finance / budgeting application that replaces an existing spreadsheet tool, "The Measure of a Plan Budgeting Tool v5" (full source spec folded into this document — see §7). Runs identically across desktop browser, iOS, and Android from a single codebase.

**Origin constraint:** The author has already built an npm library, **drivestore**, which treats a user's hidden **Google Drive `appDataFolder`** as a path-based file store. This is the entire backend — there is no traditional server. Data lives in the user's own Drive, tied to their Google account, and is free to operate.

**MVP mandate:** Faithfully replicate the existing spreadsheet's functionality first (§7 is the literal checklist), engineered from day one so the following roadmap features never require re-architecture:
- Savings/investment **containers** (tracker accounts) money can be routed into — realized in full as **Savings Goals** (§5.9), coordinated with category budgets through the unified monthly allocation plan (§6.8).
- Dynamic (user-defined, **uncapped**) categories.
- Recurring transactions (§5.8).
- Quick-add shortcuts (§6.6) as the near-term stand-in for home-screen widgets.
- An "overall balance" concept that can meaningfully differ from raw bank balance (§5.7).

**Product thesis:** yaccount is more than a record of where money went — it aims to give **every dollar a purpose before it is even earned**. Income is allocated forward across steady spending categories and accumulating savings goals until nothing is left unassigned; the savings system (§5.9) and the monthly allocation plan (§6.8) are the machinery that makes this concrete.

**Design tenets:**
- Sleek, minimalist, modern visual direction; category-level color coding used throughout charts and UI (concrete design tokens/wireframes: not yet designed, see §10).
- Fully decentralized / zero-infrastructure: no app server, no database server. Google Drive AppData + on-device storage are the only persistence layers.
- Bulletproof financial data integrity: never silently lose, move, or overwrite a transaction, especially across offline/multi-device use.
- Every artificial scale limit in the original spreadsheet (category counts, transaction row counts, month counts — all a byproduct of spreadsheet mechanics, not intentional product design) is removed by default in the rebuild unless explicitly stated otherwise.

---

## 2. Platform & Framework Architecture (locked)

### 2.1 The pivot: Capacitor instead of PWA

Originally scoped as an installable PWA. **Superseded.** The author wants one app that runs as:
1. A normal web app, unwrapped, in a desktop browser tab.
2. A true native-installed app on iOS and Android, via **Capacitor** (wraps a web build in a native WKWebView/Android WebView shell, unlocking native plugins — secure storage, system-browser OAuth, and potentially native widget bridges down the line — that a plain PWA can't get on iOS).

**Locked:** it is the *same build* across all three surfaces — not a separate desktop-optimized codebase. UI **layout** reorganizes responsively per platform/breakpoint (e.g. nav patterns, information density), but functionality, data model, and business logic remain identical everywhere.

### 2.2 Framework: Next.js, static export mode

Considered dropping Next.js for plain Vite + React (lower overhead, since a Capacitor-wrapped app can't use Next's server features anyway). **Decision: keep Next.js**, specifically configured with **static export** (`output: 'export'` in `next.config.js`), which compiles the app down to plain static HTML/JS/CSS — exactly what Capacitor wraps and what a plain browser can serve with no server involved.

**Why keep Next.js over Vite despite not using SSR/API routes today:** the author explicitly wants to preserve the *option* — acknowledged as a slim but non-zero possibility — of later migrating to a full backend-integrated architecture (SSR, API routes, server actions) without a framework rewrite. Static export today, full Next.js server features later if ever needed, is a strict superset path; Vite would not offer this without a separate migration.

### 2.3 Cross-platform data-layer consequence

Because the same static build runs in three environments, **all storage must be available in a plain browser context** — no native-only storage APIs. This confirms IndexedDB (§8) as correct for all three targets (available in desktop browsers, and inside Capacitor's WebView on both iOS and Android). Capacitor's native secure-storage plugin is used *only* for the native OAuth refresh token (§3), not for app data.

---

## 3. Authentication & Authorization (locked)

### 3.1 Problem statement

Standard OAuth2 "Web Application" flows assume a server-held client secret. Yaccount has no server, so Google Cloud Console must register yaccount as **Native Application (iOS/Android)** and **Single Page Application (Web)** client types — both are genuine public clients; **no client secret is ever generated or required**.

Key unlocking fact: `drivestore`'s `createDriveStore()` accepts `accessToken` as either a raw string **or an async function** (`() => Promise<string>`). The `.env`/`AUTH_GOOGLE_SECRET` pattern seen in drivestore's own docs is just its demo/server-side default — not a requirement. Token acquisition is fully decoupled from drivestore; yaccount owns this independently and simply hands drivestore a callback.

### 3.2 Scope classification (researched, locked)

`https://www.googleapis.com/auth/drive.appdata` is officially classified by Google as a **Recommended / Non-sensitive** scope — Google's Drive API scope reference lists it explicitly, and Google's own Drive documentation confirms an app must request this non-sensitive scope specifically to access the AppData folder.

**Practical consequence:** yaccount only needs **basic verification** (standard OAuth consent screen — app name, logo, support email, privacy policy link, verified domain). It does **not** need the heavier sensitive-scope review (demo video, detailed justification) or the restricted-scope security assessment (CASA audit, annual re-verification) — those only apply to scopes with much broader access (e.g. full Drive/Gmail content), and specifically to apps that store/transmit that data through a server they control, which yaccount structurally does not have.

**Local development/testing:** requires zero payment or approval wait. Create a free Google Cloud project, configure the OAuth consent screen, and keep it in **"Testing"** publishing status (up to 100 test users added by email, e.g. your own account) — this is a fully functional real OAuth flow, not a mock, just gated to explicitly added testers.

### 3.3 Two distinct token-acquisition flows (locked)

**A. Native (iOS/Android, inside Capacitor):**
- OAuth client type: **iOS** and **Android** (separate client IDs), registered in Google Cloud Console — true public clients, no secret.
- Flow: **Authorization Code + PKCE**, launched via the **system browser** (ASWebAuthenticationSession on iOS / Custom Tabs on Android) — never an embedded webview, which Google blocks for OAuth.
- Suggested implementation: a Capacitor OAuth plugin (e.g. `@capacitor-community/generic-oauth2`) to drive the system-browser round trip.
- This flow **can** return a real `refresh_token` (installed-app/native clients are eligible for offline access) → **persistent login** on native. Refresh token stored in native secure storage (Keychain on iOS / Keystore on Android via a Capacitor secure-storage plugin) — never in IndexedDB/localStorage.
- Requires a **custom URL scheme redirect** registered both in Google Cloud Console and in Capacitor's native config — see §3.5 for what this is and why.

**B. Desktop, unwrapped browser:**
- OAuth client type: **Web application**, separate client ID from the native ones.
- Flow: Google Identity Services' JS token client (`google.accounts.oauth2.initTokenClient`), `ux_mode: 'popup'`. Returns a short-lived access token directly to client JS, no secret involved.
- **No refresh token** — browsers cannot hold one safely without a backend. Session needs periodic silent re-authorization (`prompt: ''`) before expiry; if silent renewal is blocked (e.g. Safari's third-party storage partitioning), falls back to a quick re-consent popup.

**Locked trade-off:** it's acceptable that native users get persistent login while desktop-browser users must periodically re-approve a popup. This asymmetry is inherent to what each platform can safely do, not a compromise worth engineering around.

### 3.4 Unified interface into drivestore

A single `AuthProvider` abstraction exposes `getAccessToken(): Promise<string>`, backed internally by whichever flow (§3.3-A or §3.3-B) is active for the current platform. This is the function handed to `createDriveStore({ accessToken: getAccessToken })` — drivestore itself never needs to know which platform or flow is in play.

### 3.5 What a "custom URL scheme redirect" actually is (reference note, for continuity)

Native apps have no `https://` address the OS can route a browser redirect back to. The fix: register a private URL prefix unique to the app (reverse-DNS convention, e.g. `com.yaccount.app://oauth2redirect`) with both the OS (via Capacitor config) and Google Cloud Console (as an allowed redirect URI for the native OAuth clients). After the user approves access in the system browser, Google redirects to that custom-scheme URL; the OS recognizes it belongs to yaccount and routes control (plus the auth code) back into the app. This identifier is also what later becomes the iOS Bundle ID / Android Package Name when the app is actually registered with Apple/Google for distribution — see §9 for current naming status.

### 3.6 Registration vs. distribution (reference note, for continuity)

Two separate concerns, only one of which is needed right now:
- **Google Cloud OAuth client (needed now, free, no approval wait):** required even for local device testing — without it, Google's login page won't talk to the app at all. Set up at [console.cloud.google.com](https://console.cloud.google.com); keep the app in "Testing" status during development.
- **Apple Developer Program ($99/yr) / Google Play Console ($25 one-time) — not needed yet.** Not required to build and run on your own physical device (Xcode + free Apple ID, with a 7-day signing-cert refresh cycle; Android Studio + USB debugging, no account at all). Only needed later for TestFlight/Play-internal sharing or public store submission.

---

## 4. drivestore — Reference (external dependency, already built)

`drivestore` treats Google Drive's hidden `appDataFolder` as a path-based file store (`folder/file.txt`). Requires an OAuth 2.0 access token with the `drive.appdata` scope (§3.2).

```ts
import { createDriveStore } from "drivestore";

const store = createDriveStore({
  accessToken: getAccessToken, // string OR async () => Promise<string> — see §3.4
  rootName: "my-app",          // optional, defaults to "drive-store"
  timeoutMs: 5000,              // optional
  maxRetries: 3,                // optional
});
```

| Method | Signature | Notes |
|---|---|---|
| `read` | `(path) => Promise<string>` | Throws 404 if missing |
| `write` | `(path, content) => Promise<void>` | Overwrites/creates with string data |
| `readBytes` | `(path) => Promise<Uint8Array>` | Throws 404 if missing |
| `writeBytes` | `(path, data) => Promise<void>` | Overwrites/creates with binary data |
| `append` | `(path, content) => Promise<void>` | Appends string; **non-atomic** |
| `exists` | `(path) => Promise<boolean>` | Never throws |
| `delete` | `(path) => Promise<void>` | Throws 404 if missing |
| `list` | `(path) => Promise<DriveEntry[]>` | Returns `{ name, type: "file" \| "directory" }[]`; use `""` for root |

Errors throw `DriveError` with `.status` (HTTP code) and `.body` (raw API response string).

---

## 5. Data Model (locked)

The core architectural pattern is **Global Budgets / Local Containers**, extended with a purpose layer:
- **Categories** carry budgets globally — *what money does* per transaction.
- **Containers** are pure asset-allocation buckets — *where money lives* — decoupled from category.
- **Goals** (§5.9) are a *purpose + plan* overlay on a container — *what a pool of money is being saved toward* — decoupled from both of the above.

These three axes are independent: a category answers "what kind of spend is this," a container answers "which pool did it move through," and a goal answers "what is this pool accumulating toward." Keeping them separate is what lets each vary freely without disturbing the others.

### 5.1 `categories`
| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | TEXT (UUID) | PK | |
| name | TEXT | UNIQUE, NOT NULL | |
| type | TEXT | NOT NULL, CHECK IN ('expense','income') | |
| is_archived | BOOLEAN | DEFAULT false | Soft delete only — never hard-deleted (§5.5) |
| color | TEXT | nullable | Hex/token for chart & UI color-coding. **Locked (hybrid):** `null` = auto-assigned deterministically from a fixed palette at render time; a non-null value = explicit user override. Auto default ships with charts; the override UI is deferred to the design system (§10.6). |

**No category count cap** (the spreadsheet's 80-expense/15-income limit was a spreadsheet-column artifact, not a design intent — explicitly removed).

### 5.2 `containers`
| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | TEXT (UUID) | PK | `'general'` auto-created on first init as the default wallet |
| name | TEXT | UNIQUE, NOT NULL | |
| is_investment | BOOLEAN | DEFAULT false | Flags containers tracking decoupled long-term assets (§5.6). Orthogonal to whether the container carries a goal (§5.9.2). |
| include_in_overall_balance | BOOLEAN | **DEFAULT false**, except `'general'` which defaults **true** | Drives the "Current Overall Balance" metric (§5.7). Opt-in, not opt-out — see §5.7 rationale. |
| is_archived | BOOLEAN | DEFAULT false | Soft delete only — never hard-deleted, identical policy to categories (§5.5). |

- Container balances **can go negative**; the UI renders negative-balance containers in red rather than blocking the transaction.
- One container is the global **Default Spending Container** in settings (defaults to `'general'`) — what quick-log shortcuts use implicitly so routine spending never requires picking a container.
- Containers are **archived, never hard-deleted** (`is_archived = true`). An archived container leaves active selection UI but remains a valid FK target, so historical charts, the Container Flows view (§5.4), and past goal cycles (§5.9) never break.
- A container may exist with no goal (a plain bucket), with an active goal, or with a history of completed goals. Every goal, conversely, belongs to exactly one container (§5.9.2).

### 5.3 `budget_targets` (time-variant, no `end_date`)
| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | TEXT (UUID) | PK | |
| category_id | TEXT | FK → categories.id, ON DELETE RESTRICT | |
| amount | REAL | NOT NULL, CHECK ≥ 0 | |
| start_date | TEXT (ISO YYYY-MM-DD) | NOT NULL | Effective until the next row for the same category. **Unique per `(category_id, start_date)` (locked):** setting a budget for a date that already has a row **upserts** (replaces) it — the `setBudgetTarget` op upserts by that natural key in `apply()`, so no duplicate survives even across device merges, keeping "latest row ≤ X" resolution unambiguous. |

A budget row's effective end is implicit: either never, or the day before the next row for that category begins. This supports both permanent shifts (e.g. Groceries $300→$600/mo after a lifestyle change) and one-off anomalies (e.g. a single elevated month that reverts once a following row exists) without redundant/error-prone explicit end-date bookkeeping.

**Resolution logic (IndexedDB-native, superseding the earlier SQL-window-function sketch):** keep each category's budget rows sorted by `start_date` in memory; to resolve "what was the budget on date X," binary/linear-search for the latest row with `start_date <= X`. Historical reports must always evaluate against the budget active *at that time*, never against the current/latest value.

A `budget_target` is a **flow** allowance (steady monthly spend), distinct from a **goal** contribution (accumulation toward a target). The two live in separate tables but surface together in the monthly allocation plan (§6.8), where the flow-vs-stock distinction is spelled out.

### 5.4 `transactions` (unified ledger — expenses, income, transfers, templates, recurring-pending)
| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | TEXT (UUID) | PK | |
| date | TEXT (ISO YYYY-MM-DD) | NOT NULL | |
| amount | REAL | NOT NULL | **Sign convention: negative = expense/outflow, positive = income/inflow**, so balance = `SUM(amount)` trivially. Refunds/credits are simply smaller-magnitude negative expense rows — no separate concept needed. |
| vendor_source | TEXT | NOT NULL | Payee or funding source. **For Transfers** (no external payee) it auto-defaults to a synthesized `"{source} → {dest}"` label from the container names, user-editable — so `NOT NULL` holds with no friction. Same rule for `recurring_rules.template_vendor_source` (§5.8) on transfer rules. |
| category_id | TEXT | FK → categories.id, **nullable** | NULL only for Transfers |
| container_id | TEXT | FK → containers.id, NOT NULL | Source container (or the account for a normal transaction) |
| to_container_id | TEXT | FK → containers.id, nullable | Only set for Transfers — destination container |
| is_template | BOOLEAN | DEFAULT false | True = saved 1-tap quick-log shortcut, not a live ledger entry |
| template_name | TEXT | nullable | Shortcut display name, e.g. "Tim Hortons" |
| inbox_status | TEXT | DEFAULT 'approved', CHECK IN ('pending','approved') | Used by the recurring-transaction approval flow (§5.8) |
| recurring_rule_id | TEXT | FK → recurring_rules.id, nullable | Set only on rows auto-generated from a recurring rule |
| notes | TEXT | nullable | |

**Three transaction shapes** share this one table, distinguished by their fields:
- **Expense / income** — `category_id` set, `to_container_id` null; sign of `amount` distinguishes the two.
- **Transfer** — `category_id` null, `to_container_id` set; moves money between two owned containers.

**UI display rule:** expenses are always rendered with an explicit negative sign (e.g. "Starbucks: −$10"), not just implied by color, for unambiguous clarity.

**Balance computation (clarifies the "trivial" shorthand above):** because a Transfer is a *single* row keyed to the **source** `container_id` (with `to_container_id` naming the destination), a container's balance is **not** literally `SUM(amount)` filtered on `container_id` alone — that would debit the source but never credit the destination. The destination credit must be added back, and non-ledger rows excluded:
```
balance(c) = SUM(amount WHERE container_id = c)            // outflows + normal expense/income
           − SUM(amount WHERE to_container_id = c)          // credit the transfer destination (amount is negative → subtracting adds)
   over rows WHERE inbox_status = 'approved' AND is_template = false
```
The "`balance = SUM(amount)` trivially" phrasing holds only for the expense/income rows of one container; **transfers** (destination leg) and the **template / pending** exclusions are the standing caveats, and every downstream balance/contribution/report derivation must apply them. This is consistent with the Net Contributions primitive (§5.6), which already credits via "Transfers *into*" (i.e. `to_container_id`).

**Sign vs. category type (locked, soft):** the sign convention is a **UI default**, not a schema constraint. The entry form pre-signs by category type (expense → negative, income → positive) and asks for confirmation on an unusual sign, but the data layer **permits either sign on any category** — because voids/reversals (a +$100 row cancelling a −$100 expense) and refunds/credits legitimately carry the opposite sign and must net *within* their category. Reports stay correct because everything is a signed sum. (So a refund may be recorded either as a magnitude reduction of the original or as a separate opposite-sign credit row — both net identically.)

**Transfers are structurally distinct:** no category, they move money between owned containers and are explicitly excluded from category-based Expense/Income dashboards (nothing left the user's real-world possession). A dedicated **Container Flows** view reports net inflow/outflow per container over the active reporting period, fully decoupled from category charts. The transfer-vs-expense distinction is load-bearing for savings goals: a transfer into a goal's container is a *contribution*, whereas an expense out of it is *spending on purpose* — the two are accounted for completely differently (§5.9.3).

### 5.5 Deletion policy (categories & containers)
Soft delete only (`is_archived = true`) — never hard-deleted, never nullified/orphaned. Archived rows vanish from active selection UI but remain valid FK targets so historical charts, Container Flows, and past goal cycles never break. Goals follow the same never-hard-delete principle via their own lifecycle states (§5.9.6).

### 5.6 Container investment / asset tracking

**`container_snapshots`:**
| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | TEXT (UUID) | PK | |
| container_id | TEXT | FK → containers.id | Expected to be an `is_investment = true` container |
| date | TEXT (ISO YYYY-MM-DD) | NOT NULL | |
| reported_balance | REAL | NOT NULL | Real-world value at that moment |

Only actual cash movement into/out of an investment container is logged as a normal Transfer (no category, doesn't touch Income/Expense graphs). Market growth is never logged as a transaction.

```
Net Contributions    = SUM(Transfer amounts into that container)  − SUM(Transfer amounts out)
Current Value        = latest container_snapshots.reported_balance
Unrealized Gain/Loss = Current Value − Net Contributions
```

**Net Contributions is the general savings-progress primitive.** It is not investment-specific: it is the exact quantity a `spend_down` goal measures progress against (§5.9.3). For an `is_investment` container it additionally underlies Unrealized Gain/Loss above; for a plain spend-down goal it is simply the progress numerator, with the snapshot/market-growth machinery inert. This is why the savings system adds essentially no new accounting concept — it generalizes one that already existed here.

**Historical chart gap-filling — Reconstructed Balance Engine (locked):**
```
Balance(month) = Nearest known snapshot ± SUM(Transfers in the gap to target date)
```
Chosen over simple carry-forward, which would ignore any transfers during un-snapshotted periods and produce false "cliff" jumps whenever the next snapshot is logged.

### 5.7 "Current Overall Balance" definition (locked, opt-in model)

```
Current Overall Balance = SUM(containers.balance WHERE include_in_overall_balance = true)
```

**Default is exclude, not include** — deliberately inverted from the naive "sum everything non-investment" approach. Rationale (user's own framing): most containers represent money the user is *saving up toward* something (e.g. new clothes), and should not silently inflate a headline "you have $X to spend" number. Only the default `'general'` spending container is included out of the box; any other container must be explicitly opted in by the user if they want it counted (independent of its `is_investment` flag — the two are separate concerns, since a non-investment container like a "Vacation Fund" should typically still be excluded by default). Because goal containers inherit this default, money being saved toward a goal never inflates the headline spendable balance unless the user opts it in.

### 5.8 Recurring / quick transactions

**Templates (1-tap quick log):** rows with `is_template = true`, created via a **"save as shortcut"** action available from any transaction's detail view. **No cap** on how many templates a user can have.

**`recurring_rules`** formalizes scheduled/recurring generation. A rule can express any of the three transaction shapes (§5.4) — income, expense, or **transfer** — the last of which is what powers goal auto-contributions (§5.9.5).

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | TEXT (UUID) | PK | |
| frequency | TEXT | CHECK IN ('daily','weekly','biweekly','monthly','annually','custom') | |
| interval_config | JSON | shape depends on `frequency` (see below) | |
| template_amount | REAL | NOT NULL when `amount_mode = 'fixed'`; ignored/recomputed when `'goal_derived'` | The occurrence amount |
| template_vendor_source | TEXT | NOT NULL | |
| template_category_id | TEXT | FK → categories.id, nullable | Null for transfer rules |
| template_container_id | TEXT | FK → containers.id, NOT NULL | Source container (funding source for a transfer rule) |
| template_to_container_id | TEXT | FK → containers.id, nullable | **Destination**; set only for **transfer** rules — enables recurring transfers, including goal auto-contributions (§5.9.5) |
| amount_mode | TEXT | CHECK IN ('fixed','goal_derived'), DEFAULT 'fixed' | `'goal_derived'` → the pending amount is computed from `linked_goal_id`'s `required_monthly` **at generation time** (§5.9.5), so a deadline goal's drifting ask never logs stale |
| linked_goal_id | TEXT | FK → goals.id, nullable | Set when this rule is a goal's auto-contribution; completing/cancelling the goal cancels the rule (§5.9.5) |
| start_date | TEXT (ISO) | NOT NULL | |
| end_date | TEXT (ISO) | nullable | null = indefinite |
| next_generation_date | TEXT (ISO) | computed/cached | drives scheduling |

**`interval_config` shape per frequency (locked):**
- `daily` — no extra config
- `weekly` — `{ day_of_week }`
- `biweekly` — **"twice a month," using the same day-of-month mechanism as `monthly`, just with two anchor days** (e.g. 1st & 15th) — deliberately **not** a strict every-14-days cadence. A user who needs a true 14-day cadence uses `custom` (`every 2 Week`) instead.
- `monthly` — `{ day_of_month }`
- `annually` — `{ month, day }`
- `custom` — `{ every: <positive integer>, unit: 'day' | 'week' | 'month' | 'year' }`

**Generation / approval flow:** due rules generate a single pending transaction (`inbox_status = 'pending'`) one at a time as each occurrence comes due — not a batch of future rows — since real-world prices drift and a monthly charge shouldn't silently auto-log at a stale amount. Pending rows are excluded from all dashboard/budget calculations until approved. A **Pending/Inbox** queue supports 1-tap approval and **multi-select bulk approval**. For `amount_mode = 'goal_derived'` transfer rules the "one occurrence at a time" behavior is load-bearing rather than incidental: `required_monthly` is recomputed per occurrence so the self-correcting deadline ask is always captured fresh (§5.9.5). **One-at-a-time is now confirmed (locked), not merely recommended.**

**Backfill of missed occurrences (locked):** because a static app only runs when opened, occurrences can come due while it is closed. On next open, backfill depends on `amount_mode`:
- **`fixed`** → generate **every** missed occurrence, oldest-first, each dated to its own due date (those charges/owed contributions really happened — never silently skipped).
- **`goal_derived`** → generate a **single** current occurrence at the present (already-self-corrected) `required_monthly`. Stacking one per missed month would double-count, since the deadline ask already rose to absorb the misses.

### 5.9 Savings Goals

A **goal** is a *purpose + plan* layered onto a container: it names what a pool of money is accumulating toward and how fast, decoupled from both "where money lives" (the container) and "what money does per-transaction" (the category). Containers stay dumb asset buckets; a goal is the intention that fills one.

#### 5.9.1 Central primitive — progress is *contributions*, not *balance*

The naive design — goal progress = container balance — breaks the instant you spend *on the goal's own purpose*. Buying a $20 shirt from a fully-funded $200 clothing fund drops the balance to $180, and a balance-based goal wrongly concludes "you're $20 short, contribute more," re-inflating the monthly ask even though the $200 was already set aside.

**Resolution: a goal's progress tracks cumulative net contributions** — money *committed* into the container's purpose — never its spendable balance. This is a direct generalization of the Net Contributions primitive already defined for investment containers (§5.6), now applied to every goal. Only **Transfers** move progress: a transfer *in* is a contribution, a transfer *out* is an un-contribution (the commitment was reallocated to another purpose). **Expenses never affect progress** — an expense is spending the money on its purpose, which fulfills the goal rather than undoing it, and touches container *balance* only.

Spendable **balance** is always shown *alongside* contributed, never as the driver — e.g. "set aside $200 · $180 available."

#### 5.9.2 `goals` table

| Field | Type | Constraints | Notes |
|---|---|---|---|
| id | TEXT (UUID) | PK | |
| container_id | TEXT | FK → containers.id, NOT NULL | The bucket this goal fills. **At most one goal with `status = 'active'` per container** (enforced at app level — IndexedDB cannot express a partial-unique constraint); unlimited historical (completed/cancelled) goals — this is what makes irregular recurrence work (§5.9.6). |
| name | TEXT | nullable | Cycle label, e.g. "Black Friday 2026"; defaults to the container name. |
| kind | TEXT | NOT NULL, CHECK IN ('spend_down','reserve'), DEFAULT 'spend_down' | Progress semantics (§5.9.3). |
| mode | TEXT | NOT NULL, CHECK IN ('deadline','fixed','passive') | Planning driver (§5.9.4). |
| target_amount | REAL | CHECK ≥ 0, nullable | Required for `deadline` and `reserve`; optional for `fixed` (open-ended allowed) and `passive` (drives the progress bar if set). |
| deadline | TEXT (ISO YYYY-MM-DD) | nullable | Required when `mode = 'deadline'`; advisory or null otherwise. |
| planned_monthly | REAL | CHECK ≥ 0, nullable | Committed monthly amount M for `mode = 'fixed'`; null for `deadline` (derived) and `passive`. |
| opening_contributed | REAL | NOT NULL, DEFAULT 0 | Head-start basis at cycle creation: 0 for a fresh cycle, or the container's current balance when "absorb leftover" is chosen (§5.9.6). Counts toward `target_amount`. |
| status | TEXT | NOT NULL, CHECK IN ('active','completed','cancelled'), DEFAULT 'active' | Lifecycle (§5.9.6). |
| is_archived | BOOLEAN | DEFAULT false | Soft-hide only — an achieved/abandoned goal leaves active UI but is never hard-deleted. |
| created_date | TEXT (ISO) | NOT NULL | Cycle start; the accounting anchor for contribution windowing (§5.9.3). |
| completed_date | TEXT (ISO) | nullable | Set when `status → 'completed'`. |

**Cardinality (locked):** one container has **0-or-1 active goal** and any number of historical goals; each goal has **exactly one** container. Creating a goal may **auto-create its container** ("New goal: House" spins up a House container) so the user never has to think of the two as separate objects, even though they are separate records underneath. **Name-collision rule (locked):** if a container with that name already exists, **reuse it** (attach the new goal as its next cycle) rather than auto-renaming or duplicating — *unless* it already has an active goal, in which case block with "you already have an active {name} goal" (the 0-or-1-active-goal rule). A fresh container is created only when no same-named one exists. Rejected alternatives: *N active goals per container* (a transfer into the shared bucket can't be attributed to one of several goals — ambiguous) and *one goal spanning N containers* (real but rare, e.g. a house fund split across cash + investment accounts; deferred, not architected for now).

#### 5.9.3 Progress semantics — two kinds (locked)

A single flag, `kind`, flips every downstream calculation (progress, remaining, monthly ask, completion). Everything else is identical between the two.

**`spend_down` (default) — progress = contributions.** The money exists to be spent on its purpose; spending *fulfills* the goal and must never reopen it.
```
contributed = opening_contributed
            + SUM(Transfer amounts INTO  container)      // contributions
            − SUM(Transfer amounts OUT of container)      // reallocations away
              over Transfers dated ≥ created_date
progress    = contributed / target_amount
```
Worked example (the canonical clothing scenario, $200 target by November):
- Jan–Jun: transfer $200 in → contributed $200, balance $200 → 100%, monthly ask → $0.
- Jul: −$20 expense (shirt, category = Clothing) → balance $180, **contributed still $200** → still 100%, ask still $0.
- Half-saved variant: contributed $100 by Jun, then −$20 shirt → balance $80, contributed $100, remaining = target − contributed = $100 — the spend never touched the schedule.

**`reserve` — progress = balance.** The money exists to *stay* (emergency fund, minimum buffer); here spending *should* reopen the goal, so progress deliberately follows the container's live balance.
```
progress = container.balance / target_amount        (display capped at 100%)
```
Worked example (emergency fund, $10,000 target):
- Build to $10,000 → 100%, monthly ask → $0.
- Crisis: −$3,000 expense → balance $7,000 → progress 70% → the monthly plan silently re-claims the $3,000 shortfall until refilled (§6.8).

No windowing, no `opening_contributed` accounting for a reserve — it is a set-point, not a cycle. This is the deliberate mirror image of `spend_down`: the same withdrawal that leaves a spend-down goal complete reopens a reserve goal, because one is money meant to be spent and the other is money meant to be kept.

`is_investment` (§5.2) is **orthogonal** to `kind`: an investment container can carry a `spend_down` goal ("save $50k for a house, parked in index funds"), a `reserve` goal, or none. Market growth stays handled entirely by §5.6 snapshots and is never counted as a contribution.

*Rejected:* progress = balance as the universal default — precisely the bug above for every spend-down case; retained only as the deliberate `reserve` behavior.

#### 5.9.4 Planning modes — three (locked)

`mode` is a **single driver**: it holds one quantity fixed and lets the complementary one flex. It is orthogonal to `kind`, so all combinations are valid (a reserve fund can be planned by deadline or by fixed monthly). A goal is never permitted to commit to a hard monthly *and* a hard date at once (over-determined / self-contradictory); the complementary figure is always shown but **advisory-only**.

- **`deadline` (primary / recommended) — the date is sacred; the ask flexes.** Given `target_amount` + `deadline`:
  ```
  required_monthly = max(0, (target_amount − basis) / whole_months_until_deadline)
      where basis = contributed (spend_down) | balance (reserve)   // see §5.9.7
  ```
  Current month inclusive. Miss a month → next month's ask rises automatically (built-in catch-up and time pressure — see accountability note below). Overshoot → the ask falls, reaching $0 early (= done early). Past the deadline and still short (`whole_months_until_deadline ≤ 0`) → ask = full remaining `max(0, target_amount − basis)` (no divide-by-zero), plus an explicit **re-plan** prompt. Whenever the recomputed ask becomes untenable, the app surfaces re-plan (push the date or lower the target) — it never silently smooths the number and never auto-moves the goalpost.
- **`fixed` — the ask is sacred; the date flexes.** `planned_monthly` (M) is constant; underpaying slides the *projected completion date* later, overpaying earlier. No surprise catch-up demand. Target optional (open-ended contribution allowed).
- **`passive` — tracked, claims nothing.** No ask; contributes $0 to the monthly plan (§6.8); never nags; just a progress bar against `target_amount` if set. Effectively `fixed` with M unset — for the "saving loosely, no firm plan yet" case.

**Accountability by construction (no separate metric).** In `deadline` mode the self-correcting ask *is* the accountability: a slip makes next month visibly harder, which is exactly the pressure the design wants. An earlier proposal for a separate frozen "adherence baseline / over-under-contribution" line was **cut** as redundant to this and needlessly complex — nothing is frozen to store, and editing a deadline goal's target or date needs no re-basing logic, since the forward number simply recalculates from wherever contributions currently stand.

**Granularity: whole-month, current month inclusive** — consistent with the monthly allocation plan being the canonical unit (§6.8). A sub-monthly contribution cadence (e.g. "$5/day") is presentation/automation sugar that rolls up to the monthly line; there is **no** sub-monthly goal type, and cycles recur monthly-or-longer only.

#### 5.9.5 Contributions & automation (locked)

A contribution *is* a Transfer into the goal's container (§5.4) — no new transaction type. Automation **reuses `recurring_rules`** (§5.8) rather than introducing a parallel scheduler:

- A goal may **opt in** to auto-contribution, which creates a linked recurring **transfer** rule (`template_to_container_id` = the goal's container, `linked_goal_id` set).
- **`fixed` goal** → `amount_mode = 'fixed'`, `template_amount = M`.
- **`deadline` goal** → `amount_mode = 'goal_derived'`: the rule computes `required_monthly` from the linked goal **at generation time**, so the amount tracks the self-correcting number instead of going stale. This is the single genuinely new engine behavior the savings system introduces, and it fits §5.8's existing "generate one occurrence at a time, never a stale batch" principle exactly.
- Every generated contribution lands as a **pending** transfer in the inbox (§5.8) and moves money only on approval — never a silent auto-transfer draining the source container. Bulk-approve applies.
- The rule is **linked** to the goal: completing or cancelling the goal cancels the rule, and a `deadline` goal reaching $0 required stops generating. No orphaned auto-transfers.

*Rejected:* a dedicated contribution scheduler — it would be `recurring_rules` rebuilt under a new name.

#### 5.9.6 Lifecycle & recurrence (locked)

**Recurrence is emergent, not scheduled.** The *container* is the persistent theme ("Clothing"); each *goal row* is one independent cycle. Because targets live on the goal, not the container, cycles are free to differ arbitrarily — $200 one year, $50 the next, skipped for three years, or compressed into a few months — with no reconciliation and no lost history. This is precisely why goals are a separate table and not fields on the container: fields would be overwritten each cycle, destroying the record of past cycles. There is **no rigid auto-spawn cadence** (it would fight "not always recurring / values change / skip years"); an optional, deferrable **template + reminder** convenience layer (pre-fill last cycle's params, nudge "start this year's?") is documented but non-blocking (§10). The core system does not depend on it.

**Completion** diverges by `kind`:
- **`spend_down` completes and closes** (terminal) once `contributed ≥ target_amount`. The ask drops to $0, the linked recurring rule cancels, and it stops nagging the plan; it stays **visible as achieved** (the motivating moment) until the user manually archives it. The container may then sit empty or be repurposed for the next cycle.
- **`reserve` completes but oscillates** (never terminal) once `balance ≥ target_amount`. It hovers at 100%; any withdrawal silently reopens the shortfall (replenish). A set-point, not a finish line.

**Over-contribution** past target is allowed and shown above 100% (e.g. "$220 / $200 · 110%") — never blocked or auto-capped for `spend_down` (an intentional buffer). `reserve` goals naturally don't over-fill, since their ask is already $0 at target.

**Cancellation** ends the goal only (`status = 'cancelled'`: stops the ask, cancels the linked rule) and **never moves money** — the balance stays in the container for the user to transfer out or repurpose, upholding the "never silently lose or move a transaction" tenet (§1). Goals are soft-ended, never hard-deleted.

**Leftover absorb.** When a new cycle starts on a container that still holds a prior balance, the user is offered **"absorb leftover as head-start"** (default **on**): `opening_contributed` is set to the current container balance, so the residue counts toward the new target. Declining leaves the residue as balance in excess of goal-contributed (honest and unattributed) — it is never auto-swept.

#### 5.9.7 Derived quantities (reference)

None of these are stored; all are computed on demand from the ledger and the goal row:

| Quantity | Definition |
|---|---|
| `contributed` | `spend_down`: `opening_contributed` + net Transfers into the container since `created_date`. `reserve`: not used (progress is balance). |
| `balance` | `SUM(amount)` over all transactions for the container (spendable now). |
| `progress` | `spend_down`: `contributed / target_amount`. `reserve`: `balance / target_amount` (display-capped at 100%). |
| `required_monthly` | `deadline`: `max(0, (target_amount − basis) / whole_months_until_deadline)`. `fixed`: `planned_monthly`. `passive`: `0`. **`basis = contributed` for `spend_down`, `basis = balance` for `reserve`** (a reserve measures its gap against live balance, so a withdrawal re-opens the ask). **Guard:** `whole_months_until_deadline ≤ 0` (at/after the deadline) ⇒ ask = `max(0, target_amount − basis)` plus a re-plan prompt — never divide by zero (§5.9.4). |
| `projected_completion` | `fixed` **with target**: date at which `contributed` reaches `target_amount` at rate M. Advisory. **Open-ended `fixed` (no target):** none — the goal shows as **"Open-ended"** (running total contributed only; no projected date, no progress-percentage bar, since both need a target). |

### 5.10 Edge cases resolved
| Edge case | Resolution |
|---|---|
| Investment growth vs. income | §5.6 — Transfers + snapshots, never logged as Income |
| Container balance goes negative | Allowed; UI flags in red |
| Transfers invisible to category reports | By design; compensated by the Container Flows view (§5.4) |
| Refunds/credits | Folded into the unified sign convention — a refund is just a smaller-magnitude negative expense row, always displayed with an explicit minus sign |
| Overlapping `budget_targets` rows | Structurally moot once `end_date` was dropped — a new row always cleanly supersedes the prior one at its `start_date` |
| Category count limits | Removed entirely — was a spreadsheet artifact, not a design intent |
| Spend on-purpose vs. goal progress | §5.9.3 — expenses cut *balance*, never `contributed`; only Transfers move goal progress |
| Reserve fund depleted by a withdrawal | §5.9.3 / §6.8 — reserve progress = balance, so a withdrawal reopens the shortfall and the monthly plan re-claims it |
| Goal over-contributed past target | §5.9.6 — allowed, shows >100%, never blocked or auto-capped (`spend_down`) |
| Cancelling a goal with money still in it | §5.9.6 — ends the goal only; money is never moved, it stays in the container |
| Many recurrence cycles on one container | §5.9.2 / §5.9.6 — each cycle is an independent goal row; ≤1 active, N historical; per-cycle targets free to differ |
| Leftover at a cycle's end | §5.9.6 — offered as head-start (`opening_contributed`; absorb default on) |

---

## 6. Reporting & Dashboard System (locked)

### 6.1 Unified reporting-period control

The original spreadsheet had **three fully independent time-window pickers** (Dashboard, Historical Comparison, Comparison to Budget Targets) with no shared state — explicitly flagged in the source spec as a decision a rebuild should make deliberately. **Locked: one shared global reporting-period control**, with the standard preset menu carried over from the source tool (Last month / Last 3 months / Last 6 months / Last 12 months / Year to date / All / Custom), plus **optional per-widget override** where a specific report needs its own window.

### 6.2 Historical Comparison — folded in, not a separate page

The spreadsheet's dedicated "compare two arbitrary periods side by side" report is **not** kept as a standalone page. Instead, "pick two ranges to compare" becomes a capability of the unified reporting-period control itself (§6.1).

### 6.3 Budget Targets "Monthly Average" — re-scoped

The source tool's Budget Targets sheet always computed "Monthly Average" against **all-time** transaction history, never the currently-selected period — flagged in the source spec as likely unintended. **Locked: re-scope this to the active reporting period**, consistent with every other metric in the app, rather than preserving the spreadsheet's quirk.

### 6.4 Category charts — true zero-filtering

The spreadsheet's pie-chart data-prep claimed to filter out $0 categories but, per the source spec's own internal audit, didn't actually do so. **Locked: implement genuine zero-filtering** in the rebuilt category-breakdown charts — categories with no spend in the active period are omitted from the legend/chart entirely, for cleaner visuals.

### 6.5 Chart inventory (MVP, inherited + updated from source tool)

Kept as **distinct chart types** (not collapsed into fewer/simpler charts):
- Category breakdown doughnut/pie charts (expense + income, zero-filtered, period-total and period-monthly-average variants).
- Monthly bar charts (income, expenses, savings) with budget-target reference overlay.
- Single-category drill-down bar chart (month-by-month spend in one selected category vs. its budget target).
- **Income → Expenses → Savings waterfall chart**, kept as its own distinct chart type per explicit instruction, not simplified into a plain grouped bar chart.

### 6.6 Quick-add shortcuts (near-term widget substitute)

Native home-screen widgets (both a quick-log widget and a balance-display widget) are explicitly **deferred post-MVP** — building real WidgetKit-based native widgets is a significant scope jump (actual Swift/native code) that doesn't fit the current cross-platform-from-one-codebase approach. For now, the **in-app "save as shortcut" quick-log flow** (§5.8) is the mechanism for fast repeat-transaction logging; true native widgets remain a documented but unscheduled roadmap item.

### 6.7 Unused-category dimming — not applicable

The spreadsheet's greyed-out "unused category slot" styling was purely a fixed-width-array artifact (§2.2 of the source spec). **Confirmed not applicable** — dynamic, uncapped categories make this concept moot.

### 6.8 Monthly Allocation Plan — "every dollar a purpose" (locked)

The savings system's payoff surface, and the product thesis (§1) made mechanical. A live, entirely view-time-derived statement for the active month that forces every earned dollar to be claimed by a *flow* (category allowance) or a *stock* (goal contribution):
```
  Income expected
− Σ category allowances   (active budget_targets this month)      ← flow: steady, recurs monthly
− Σ goal asks             (per-mode, per §5.9.4)                  ← stock: blinks in/out per cycle
= Unallocated
```
**`Income expected` (source, locked):** if the month is covered by one or more active **income** `recurring_rules` (§5.8), it is the **sum of those rules' occurrences** scheduled for the month; otherwise it is a **user-entered** expected-income figure for the month. Recurring income rules take precedence when present; the manual figure is the fallback when none exist.

Per-mode goal ask: `deadline` → `required_monthly` (self-correcting); `fixed` → M; `passive` → $0. **`reserve` goals use the same per-mode formulas but computed against `balance`, not `contributed` (§5.9.7):** `deadline` spreads the refill `(target − balance)/months_left`, `fixed` refills at M until `balance ≥ target`, `passive` asks $0 — and a withdrawal re-opens the ask automatically. (The intuitive "current shortfall" is just the degenerate deadline-now case; `mode` still governs how fast a reserve refills.) Nothing here is stored — the plan is a single live query.

**Flow vs. stock** is the distinction that keeps category budgets and goals as separate entities yet unites them in this one view. A category budget is *flow*: a steady monthly allowance, spent as earned, with no accumulation, no target lump, and no completion (groceries, gas, utilities). A goal is *stock*: it accumulates toward a target, discharges in a burst, completes, and may recur irregularly (§5.9). The tell is **accumulation**. A sinking fund for an irregular or annual expense is therefore a *goal*, not a category budget — e.g. $1,200 of car insurance due each June is $100/mo into a container; modeled as a category budget it would misread the June payment as a 12× overspend, whereas as a goal that payment is simply "spending down what was saved" (§5.9.3).

- **Over-allocation** (asks + allowances > income) → Unallocated goes negative and renders red ("committed $X more than you earn") — **flagged, never blocked**, consistent with §5.2's negative-balance stance.
- **Unallocated is a computed number, not a container** — leftover sits in `general` as genuinely uncommitted money; the red/nag prompts *the user* to give it a job (raise a goal, start a cycle, or leave it). It is **never auto-swept** — auto-assigning would violate "you decide every dollar's purpose."
- Visualized by the existing Income → Expenses → Savings **waterfall** and the savings **monthly-bar** charts (§6.5); requires no new chart type.

---

## 7. MVP Source Spec — "The Measure of a Plan v5" (reference, condensed)

Full original document (`TMOAP_Budget_Tool_v5_FULL_SPEC.md`) has been supplied and read in full; retained by reference as the literal MVP feature checklist. Key structural facts folded into this spec, superseding the spreadsheet's own constraints:

- **Two atomic source-of-truth tables** in the original (`Expenses`, `Income`) map onto yaccount's single unified `transactions` table (§5.4); the spreadsheet's **one atomic settings table** (per-category monthly target) maps onto `budget_targets` (§5.3); its **one atomic taxonomy table** (compacted category lists) maps onto `categories` (§5.1). Every other original sheet (Dashboard, Historical Comparison, Comparison to Budget Targets, and all internal engine sheets — Selected Time Period Data/Total, Chart Backup, Date Info) was a **pure, re-derivable view** over those tables — meaning yaccount only needs to persist the core tables (`categories`, `budget_targets`, `transactions`, `containers`) plus `container_snapshots`, `recurring_rules`, and `goals`; everything else is computed on demand.
- **Caps explicitly removed in the rebuild:** 80/15 category caps (§5.1), the 5,000-transaction-row cap (naturally superseded — a real per-device/cloud database has no such ceiling), and the 400-month reporting-window cap (naturally superseded for the same reason).
- **Negative amounts** were already permitted in the source ledgers (for refunds/credits) — carried forward and unified under yaccount's signed-amount convention (§5.4, §5.10).
- **No recurring-transaction automation, no receipts/attachments, no bank-feed integration, single category per transaction (no splitting/tagging)** in the source tool — recurring automation is now a first-class yaccount feature (§5.8); receipts/attachments, bank-feed integration, and transaction splitting remain **out of scope / not yet discussed** for yaccount (not confirmed as roadmap items — flag if desired).
- **Single currency, no user accounts/multi-device sync** in the source tool (each user just made their own spreadsheet copy) — yaccount's entire architecture (§8) exists specifically to solve real multi-device sync via a real account (Google), while remaining single-currency for now (multi-currency not yet discussed).
- Known internal inconsistencies in the source tool (stale named range for income categories; mismatched dropdown wiring) are spreadsheet implementation bugs with no equivalent concept in a real data-modeled app — no action needed.

---

## 8. Local Storage & Sync Architecture (locked, unaffected by the Capacitor pivot)

### 8.1 Rejected alternatives (for context/continuity)
- **SQLite → WASM + OPFS:** rejected — iOS Safari kills OPFS in Private Browsing and silently evicts it after 7–14 days of inactivity; requires COOP/COEP headers that break third-party asset loading; exclusive worker lock causes `SQLITE_BUSY` on concurrent access (e.g. future widget + main app).
- **SQLite Session Extension (binary changesets):** rejected — conflict resolution (`sqlite3changeset_apply()`) expects an interactive callback; `drivestore` has no live database engine on the other end to sequence/resolve patches against.
- **`sqlite-sync` (CRDT-based):** rejected — requires a live network endpoint (SQLite Cloud/Postgres/Supabase) to route CRDT blobs; fundamentally incompatible with `drivestore`'s flat-file, serverless model.

### 8.2 Final architecture: Native IndexedDB + JSON Transaction Journaling Stream

IndexedDB for local storage (works identically across desktop browser and Capacitor's WebView on iOS/Android — see §2.3), synced via plain-text, append-only JSON operation logs (one **per device**, §8.4) streamed through `drivestore.append()`. Entries are timestamped and UUID-keyed, so replaying a line twice is a no-op — merges are "apply every op across all device logs under a total order (`ts`, then `id`)." Precedent cited (paraphrased, general pattern only): Actual Budget's move toward JSON changesets over whole-file syncing to avoid lock/overwrite errors; Linear's local-log-then-replay model for offline multi-device sync; Excalidraw's plain-text/JSON-only sync for crash resistance.

Trade-off accepted: no native SQL aggregation — all reporting logic is hand-written in JS. (§5.3's budget-lookup logic has already been translated to its IndexedDB-native form; general dashboard aggregation, and the goal/monthly-plan derivations of §5.9 and §6.8, are likewise implemented as JS map/reduce over indexed data.)

### 8.3 IndexedDB compound index

```
Index name: 'by_container_category_month'
Key path: ['container_id', 'category_id', 'yearMonth']   // yearMonth e.g. "2026-07"; a STORED field on each transaction (derived from date at write time — IndexedDB indexes stored props, it can't compute at index time)
```
Enables near-instant lookups via `IDBKeyRange.only([...])` without full-store scans. The active reporting period's dataset is additionally held in an in-memory JS cache at app boot so dashboard widgets hit memory, not disk, for common aggregations; falls back to IndexedDB queries for historical/non-active periods or after a new transaction is appended.

### 8.4 Sync protocol: Checkpointer (snapshot + **per-device** ledgers)

**Why per-device, not one shared ledger (locked):** Google Drive AppData exposes **no atomic primitive** to make a single shared `ledger.json` safe — `drivestore` offers no conditional/if-match write (its `append` is documented non-atomic, and `write` is unconditional last-writer-wins), Drive v3 has no compare-and-swap update precondition, and it doesn't even guarantee create-if-absent (duplicate sibling names are allowed, so a lock file is not a reliable mutex either). The limitation is Drive's, not the wrapper's — extending `drivestore` cannot fix it. The only design with a hard "never lose a write" guarantee (§1) is to ensure **no two devices ever write the same file.**

- **`snapshot.json`** — full consolidated state dump, downloaded once on fresh install/new device. It is *derived* (rebuildable from the ledgers), so a botched/raced snapshot write is never data loss — the ledgers remain the source of truth.
- **`ledger_<deviceId>.json`** — one append-only op log **per device**; each device writes **only its own** file, so concurrent writers never touch the same object → no interleave, no lost update. `<deviceId>` is a stable per-install UUID.
- **Boot / sync flow:** on a returning device this runs **in the background** behind an already-rendered UI (§8.6), not as a boot gate — load `snapshot.json` → list and replay **all** `ledger_<deviceId>.json` files (ops after the snapshot), merged under a **total order** (op `ts`, `id` as tiebreak) with a last-writer-wins policy for concurrent edits to the same entity, applied as a delta on top of live local state → flush locally-queued pending writes to *this device's own* ledger.
- **Collapse / rotation (locked):** the trigger is an **op-count threshold** — on boot, if the count of un-snapshotted ops exceeds ~N (tunable, order ~500), the device consolidates the snapshot + all device ledgers into a fresh `snapshot.json`. Op count is a cheap running counter / IndexedDB `.count()` (chosen over a byte-size trigger, which drivestore can't measure without fetching files — `list()` returns no size, §4). **Any device performs it** opportunistically during its normal background sync — no leader election, because the snapshot is *derived*, so a rare double-collapse is redundant work, never data loss. After a fresh snapshot, each device (on seeing it) truncates **only its own** ledger to ops after the cutoff — race-free, touching no other device's file. Pre-collapse ledgers may be archived to dated `ledger_<deviceId>_YYYY-MM.json` for a permanent audit trail.

### 8.5 Offline conflict resolution

Every local create/update/delete is appended as an event to a local write queue. On reconnect, the app fetches **all remote device ledgers**, merges them with the local queue under the total order (§8.4), and appends its own new ops **only to this device's own ledger** — an offline-logged transaction (e.g. made with no signal) is never silently discarded, even if other data changed elsewhere (e.g. categories edited on another device) in the meantime. Concurrent edits to the same entity resolve last-writer-wins by (`ts`, `id`); because each device owns its file, no append can ever clobber another's.

### 8.6 Instant-open (local-first boot) & background reconciliation (locked, UX requirement)

The per-device-ledger model means a cold sync must fetch and merge N device logs — potentially slow. That must **never** gate the UI. **Hard requirement: the app opens instantly from the local cache and never blocks boot on the network.** Logging a quick transaction or checking a balance must be usable in the first frame, never behind a multi-second sync screen.

- **Returning device (local cache present):** render immediately from the local IndexedDB materialized state (§8.3); kick off the sync (§8.4/§8.5 — fetch `snapshot.json` + all `ledger_<deviceId>.json`, merge deltas) **in the background**; show a **non-intrusive "Syncing…" indicator** (a small status affordance, never a blocking spinner/modal). The user has full read **and write** access throughout.
- **Fresh install / new device (no local cache):** the one-time `snapshot.json` download is unavoidable — show a first-run loading state; every subsequent open is instant.
- **Reconciliation (no lost local edits):** ops the user makes *during* the background sync go straight to local state + this device's ledger/queue as normal. When the sync's remote ops arrive, they are applied as a **delta on top of current local state** — only op `id`s not already applied, idempotent by `id` (§8.2) — **never a wholesale state replace**, so in-session edits are preserved and remote changes merge under the total order (§8.4). Concurrent edits to the *same entity* resolve LWW by (`ts`, `id`); a rare visible overwrite of a just-made edit by a newer remote edit is the accepted trade-off, surfaced honestly as the indicator settles.
- The UI **re-derives reactively** from the updated materialized state when the sync finishes, so newly-merged remote data appears without a manual refresh.

---

## 9. Naming & Identifiers

- App name: **yaccount**.
- Bundle ID / package name / OAuth redirect scheme: **`com.yaccount.app` — LOCKED FINAL.** Used consistently as the iOS Bundle ID, Android Package Name, and custom URL scheme (`com.yaccount.app://oauth2redirect`, §3.5). Safe to register real OAuth clients and store listings against it. (Store-uniqueness is all Apple/Google require; domain ownership of yaccount.com is not needed.)

---

## 10. Open Items / Not Yet Grilled

1. ~~Category color assignment mechanism~~ **RESOLVED (hybrid):** `null` → deterministic auto-palette at render; non-null → user override. Auto default ships with charts; override UI deferred to the design system (§5.1, §10.6).
2. ~~Recurring-generation lead time~~ **RESOLVED (locked):** one pending occurrence at a time (not a batch). Backfill of missed occurrences is by mode — `fixed` generates every missed month oldest-first; `goal_derived` collapses to a single current occurrence (avoids double-counting the self-correcting ask). See §5.8.
3. ~~Bundle ID / package name finalization~~ **RESOLVED:** `com.yaccount.app` locked final (§9). Safe to register OAuth clients / store listings.
4. **Receipts/attachments, bank-feed integration, transaction splitting/multi-category tagging** — all explicitly out of scope in the source spreadsheet; not yet discussed as potential yaccount roadmap items one way or the other (§7).
5. **Multi-currency** — not discussed; source tool was single-currency only (§7).
6. **Frontend visual design system** — "sleek, minimalist, modern" plus category color-coding is the directional brief; no concrete design tokens, typography, or wireframes exist yet.
7. **Multi-account/household support** — not discussed; current auth design (§3) assumes a single Google account per install.
8. **Savings-goal template + reminder layer** — the optional, deferrable convenience wrapper over emergent goal cycles (pre-fill last cycle's params; nudge to start the next) is speced as non-blocking but not yet designed (§5.9.6). The core goal system does not depend on it.
9. **Sub-monthly contribution cadence UI** — contributions may be logged at any cadence but always roll up to the canonical monthly line; the UI should steer very-short cadences toward category budgets rather than surfacing "daily goals" (§5.9.4). Minor.
10. ~~Snapshot-collapse cadence & collapsing-device election~~ **RESOLVED:** trigger = **op-count threshold** (~500 un-snapshotted ops), checked on boot — cheap running counter, vs a byte-size trigger drivestore can't measure without fetching files (§4 `list()` has no size). **Any device** collapses opportunistically during background sync; no election (snapshot is derived → double-collapse is harmless). See §8.4.

*The Savings Goals system itself — §5.9 (data model, kinds, modes, contribution automation, lifecycle) and §6.8 (monthly plan) — is now locked and no longer an open item.*

---

## 11. Session Log Note

Compiled across three grilling sessions (per the user's `grilling` interview pattern: one question at a time, a recommendation offered per question, no implementation until explicit shared understanding is confirmed).

- **Rounds 1–2** locked the platform/framework architecture (§2), OAuth design (§3), the core data model (§5.1–§5.8), reporting system (§6.1–§6.7), and local-storage/sync architecture (§8).
- **Round 3** locked the **Savings Goals** system end to end — the progress-is-contributions primitive, the `spend_down` / `reserve` kinds, the `deadline` / `fixed` / `passive` modes, `recurring_rules`-based contribution automation, and the emergent-cycle lifecycle — captured in §5.9, with the unified monthly allocation plan in §6.8 and supporting touches in §5.2, §5.4–§5.8, and §5.10.

This v3 consolidation is a full rewrite of v2 for coherence and completeness; no locked decision was changed, only integrated and, in a few places, made explicit (goal-creation auto-creating its container; rejected cardinality alternatives; a reserve worked example; a derived-quantities reference). No code has been implemented yet. Continue grilling from §10 before beginning implementation.
