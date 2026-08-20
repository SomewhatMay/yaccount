# yaccount — Handoff

Current operational state for the next agent. Product rules live in
[`yaccount-tech-spec-v3.md`](yaccount-tech-spec-v3.md); architecture and conventions in
[`yaccount-implementation-details.md`](yaccount-implementation-details.md). This file does not
repeat them — it says where things stand and what will bite you.

## State

- `main` is clean and deployed. Live at <https://somewhatmay.github.io/yaccount/>.
- M0–M9 and M11 are shipped, plus eleven post-M11 quality passes: mobile toast placement, ledger
  notes, the FAB money mark, the FAB hold chooser, Settings data tools, GitHub Pages delivery, and
  blocking clear/import/rollback operations, iPhone PWA interaction fixes, and deliberate
  feedback with fewer toasts, usage-ranked selectors, and starter categories.
- 64 Vitest files, 1,013 tests passing. Playwright is 45 passes and 3 expected desktop-touch
  skips at `--workers=2`, with no failures. **Run e2e at `--workers=2`** — the default six
  workers flake the FAB hold-gesture cases (see Known issues).
- **⌘K searches everything** (`src/core/engine/search.ts`): notes, amounts, dates and container
  names as well as payees, plus categories, containers, goals, recurring rules, shortcuts,
  screens and actions — one ranked list, not three. `parseQuery` reads `>100`, `<50`, `20-80`,
  `$42.50`, `2026-07`, `is:`, `in:`, `cat:`; any token that is not exactly one of those stays a
  word, so no query can fail. Results deep-link with `?focus=` (`src/features/focus-link.ts`,
  `useFocusParam`); Goals and Recurring also open the row's sheet, Categories and Containers
  deliberately do not.
- `DB_VERSION = 3`. The Drive layout is `snapshot.json`, `ledger_<id>.json`,
  `ledger_<id>_<YYYY-MM>.json`, `origin.json`, and inert `backup_*` / `orphan_*` worlds.
- Dashboard widgets can be reordered or hidden from a responsive Customize sheet. The versioned
  layout preference is device-local; Overall balance is always visible and first.

## Next

The product quality phases are complete. Choose the next scoped change explicitly, then start it
on a fresh branch off freshly pulled `main`.

**Deferred — do not start without an explicit go-ahead:**

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

`DiagnosticsPanel` renders `navigator.userAgent` during render, so `/settings` logs a hydration
mismatch. Harmless, noisy in the Playwright web-server log, not yet fixed.

The four FAB hold-gesture Playwright cases are timing-sensitive and flake under six-worker CPU
contention — a different two or three fail on each full-suite run, on unmodified `main` as well.
They pass reliably at `--workers=2`. The gesture, not the app, is what is being measured. The
cause is margin: `FAB_HOLD_MS` is 500 and the tests hold for 550, so a `setTimeout` delayed more
than 50ms by CPU contention never fires before the release. Widening the test hold would fix it.

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
