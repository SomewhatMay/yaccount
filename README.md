# yaccount

A local-first personal finance app that gives every dollar a purpose before it is earned. It
replaces a budgeting spreadsheet ("The Measure of a Plan v5") with a real data model: a unified
transaction ledger, time-variant category budgets, asset containers, savings goals, recurring
rules, and a monthly allocation plan.

There is no server. The app runs entirely in the browser from a static export, persists to
IndexedDB, and syncs through the user's own Google Drive `appDataFolder` via the
[`drivestore`](https://www.npmjs.com/package/drivestore) library.

**Live:** <https://somewhatmay.github.io/yaccount/>

## Status

Feature-complete and deployed. Milestones M0–M9 and M11 are shipped, along with six post-M11
quality passes (mobile toasts, ledger notes, the FAB money mark and hold chooser, Settings data
tools, GitHub Pages delivery). Work continues as user-scoped quality-of-life improvements.

Home's dashboard edits in place: drag cards to reorder, hide them from the card controls, and
restore them from the descriptive widget gallery. Layouts sync across connected devices. Overall
balance stays visible and first.

**Deferred by explicit decision — do not start without a go-ahead:**

- **M10 — Capacitor native packaging** (iOS/Android shell, native OAuth, secure token storage).

## Stack

Next.js (App Router, `output: "export"`) · React 19 · TypeScript strict · Tailwind v4 ·
shadcn/ui + Radix + Lucide · Jotai · Recharts · zod · `idb` / IndexedDB · `drivestore` ·
Vitest + `fake-indexeddb` · Playwright.

## Local setup

Requires Node ≥ 20.19 or ≥ 22.12 (Vitest 4 / Vite refuses to start below that).

```bash
npm install
```

Then create `.env`. It is gitignored and **not** in a fresh clone, and it must contain the public
Google OAuth web client ID:

```
NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID=<web client id>.apps.googleusercontent.com
```

Without it `getAuthProvider()` throws and the app shell fails to render.

```bash
npm run dev      # http://localhost:3000
```

## Verification

```bash
npm test         # Vitest
npm run typecheck
npm run lint
npm run build    # static export to out/
npm run test:e2e # Playwright (stop `npm run dev` first — Next refuses a second dev server)
```

## Architecture

- **`src/core/`** — pure TypeScript, platform-independent, unit-tested in Node. Model + zod
  schemas, integer-cents money, the op-log, the IndexedDB repository, derivation engines, and the
  export/import format. Never imports React, Next, Capacitor or `drivestore` (ESLint-enforced).
- **`src/features/`** — React UI, Jotai atoms (`store.ts`), and the design-system primitives in
  `features/ui/`.
- **`src/auth/`** — the `AuthProvider` seam: a pure token manager plus the Google Identity
  Services web glue.
- **`src/sync/`** — the Drive checkpointer, reset generation and data-reset flows. `drive.ts` is
  the only file that imports `drivestore`.

Every mutation is an idempotent op appended to a journal and applied to materialized IndexedDB
state in one transaction. State is the replay of the journal under a canonical total order, which
is what makes multi-device merge, export/import and rollback all speak the same language.

## Documentation

Read in this order; the earlier document wins on conflict.

1. **[`yaccount-tech-spec-v3.md`](yaccount-tech-spec-v3.md)** — product behavior and locked rules.
2. **[`yaccount-implementation-details.md`](yaccount-implementation-details.md)** — current
   architecture, code map and conventions.
3. **[`HANDOFF.md`](HANDOFF.md)** — current state, next work, operational hazards.
4. **[`src/core/README.md`](src/core/README.md)** — the core boundary.

Code and tests are the shipped truth. Git history is the archive for completed plans and
execution diaries.
