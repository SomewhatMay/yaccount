# yaccount — Handoff

Current operational state for the next agent. Product rules live in
[`yaccount-tech-spec-v3.md`](yaccount-tech-spec-v3.md); architecture and conventions in
[`yaccount-implementation-details.md`](yaccount-implementation-details.md). This file does not
repeat them — it says where things stand and what will bite you.

## State

- `main` is clean and deployed. Live at <https://somewhatmay.github.io/yaccount/>.
- M0–M9 and M11 are shipped, plus local diagnostics and eleven post-M11 quality passes: mobile toast placement, ledger
  notes, the FAB money mark, the FAB hold chooser, Settings data tools, GitHub Pages delivery, and
  blocking clear/import/rollback operations, iPhone PWA interaction fixes, and deliberate
  feedback with fewer toasts, usage-ranked selectors, and starter categories.
- 127 Vitest files, 1,302 tests passing. Playwright is 96 passes and 10 expected platform
  skips, with no failures. `playwright.config.ts` pins `workers: 4`; do not raise it (see Known
  issues).
- **Diagnostics survive reloads and financial-DB failures** in a separate `yaccount-diagnostics`
  IndexedDB. Writes batch off-path; retention is 2,000 records/14 days. Copy/download is explicit
  and local-only. Deployed builds carry exact version/SHA/build time; local builds say `local`.
- **⌘K starts with common and recent actions, then searches everything after typing**
  (`src/core/engine/search.ts`): notes, amounts, dates and container names as well as payees, plus
  categories, containers, goals, recurring rules, shortcuts, screens and actions. The bounded
  six-id action history is device-local, fails open, and never stores queries or financial data.
  Blank search skips full-data indexing. `parseQuery` reads `>100`, `<50`, `20-80`, `$42.50`,
  `2026-07`, `is:`, `in:`, `cat:`; any token that is not exactly one of those stays a word, so no
  query can fail. Results deep-link with `?focus=` (`src/features/focus-link.ts`,
  `useFocusParam`); Goals and Recurring also open the row's sheet, Categories and Containers
  deliberately do not.
- `DB_VERSION = 4`. The Drive layout is `snapshot.json`, `ledger_<id>.json`,
  `ledger_<id>_<YYYY-MM>.json`, `origin.json`, and inert `backup_*` / `orphan_*` worlds.
- Dashboard widgets edit in place. Cards drag to reorder, hidden widgets return through the
  descriptive gallery, and the versioned layout setting syncs. Overall balance stays visible and
  first. Reporting periods and fold state remain browser-local.

## Next

Continue the approved sequence in [`next-features-build-plan.md`](next-features-build-plan.md).
Next: creation-only autocomplete plus iOS keyboard/Search repair, on fresh pulled `main`.

**Deferred — do not start without an explicit go-ahead:**

- **[Future-dated transaction handling #35](https://github.com/SomewhatMay/yaccount/issues/35)** — revisit the interim dashboard rule after dashboard widgets.
- **M10 Capacitor** native packaging.

## Verify

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run test:e2e
```

Setup, Node version and the `.env` requirement are in [`README.md`](README.md).

## Known issues

**Resolved.** The suite flaked because six browser workers plus the Next dev server oversubscribe
a 12-thread box: the server gets starved and the timing-sensitive cases miss their windows.
`playwright.config.ts` now pins `workers: 4`. Measured with a clean server between every run:

| Workers | Runs | Failing runs | Wall clock |
| ------- | ---- | ------------ | ---------- |
| 6 (default) | 4 | 2 | ~53s |
| **4** | **8** | **0** | **~55s** |
| 2 | 4 | 0 | ~85s |

Four costs nothing over six — the machine was already saturated — so just run `npm run test:e2e`.

**Do not loop e2e runs back-to-back.** Playwright tears its dev server down as the next run starts,
`reuseExistingServer` attaches to the dying one, and ~33 of 47 tests fail at once. That mass
failure is a measurement artifact, not a suite fault; it cost real time to chase twice. Wait for
port 3100 to clear between runs.

**The static export fails two tests that pass against the dev server.** Serving `out/` after
`npm run build` is faster (~40s) but `creates, edits, refreshes, and quietly hides ledger notes`
and `⌘K lands on a category` fail on EVERY run — deterministic, not flaky. Nobody has looked into
why, and `out/` is what actually deploys, so it may be a real production-only bug. Note also that
React only reports hydration mismatches in dev, so the diagnostics hydration guard would go blind
if the suite were ever pointed at the export.

The FAB hold margin was a separate fragility: `FAB_HOLD_MS` is 500 and the app cancels the pending
timer on release, so the old 550ms hold left 50ms of slack. It is now
`FAB_HOLD_PAST_THRESHOLD_MS` (800) in the spec. That hardening did not cure the flake on its own.

## Hazards

- **A failed Drive read never means the data is absent.** Conflating the two shipped once and made
  every offline tick forget the reset generation and every reconnect re-adopt, setting the
  device's data aside each time. Resolve reads to present / absent / **unknown**, act only on a
  positive reading, and never forget a generation the device holds. Same rule for enumeration
  before a backup: abort rather than treat a failed `list` as an empty store.
- **Reset generation safety.** Clear, import and rollback must retire the whole current world
  first, mint a new `resetId`, and write `origin.json` **last** as the commit point. Adoption
  writes the adopting device's journal to `orphan_*` before resetting; a device that has never
  synced must merge, not adopt.
- **`drivestore` needs a bound `fetch`.** The browser's `fetch` throws "Illegal invocation" when
  called with a `this` other than `window`. `src/sync/drive.ts` passes
  `fetch: globalThis.fetch.bind(globalThis)`. Keep it.
- **The Google Cloud project needs the Drive API explicitly enabled** — separate from the OAuth
  consent screen and client ID. Without it every Drive call is a 403. It is enabled.
- **The OAuth consent screen is still in "Testing"**, so only listed test users can sign in and
  grants lapse periodically. Fine for personal use; it explains a sudden re-consent prompt.
- **Derive "today" from `src/features/clock.ts`, not `toISOString().slice(...)`.** The latter is
  the UTC day and lands evening entries on tomorrow.
- **`.env` is gitignored and absent from a fresh clone.** Without
  `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID` the auth provider throws and the whole shell fails to render
   — so every Playwright test dies at the first `page.goto`.
- **Next refuses a second dev server for the same directory**, even on another port. Stop
  `npm run dev` before running Playwright.
- **On WSL, PATH interop leaks the Windows `node.exe`/`npm`**, which produces `.bin` shims with no
  exec bit (`next: Permission denied`) and Windows-path postinstall failures. Prefix every
  `npm`/`npx` call with the WSL Node bin on `PATH`. If an install ever ran under Windows npm, wipe
  `node_modules` and `package-lock.json` and reinstall with WSL npm.
- **Prettier and CRLF checkouts.** `npx prettier --check .` flags nearly every file with
  line-ending noise. Check only files you touched, and pass `--end-of-line auto` to see real
  drift. Never `--write` the whole repo.

## Working style

Extremely concise, in writing and in commit messages. No co-author or assistant mentions in
commits. Use the `gh` CLI for GitHub. TDD: write failing tests, verify they fail, then implement.
When a decision is genuinely needed, ask **one question at a time**, never batched. Branch before
committing if you are on `main`. Commit docs alongside the work they describe.
