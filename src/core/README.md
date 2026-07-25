# src/core — platform-agnostic domain logic

Pure TypeScript. **Never** imports React, Next, Capacitor or `drivestore` (enforced by the ESLint
boundary rule in `eslint.config.mjs`). Fully unit-testable in Node, with `fake-indexeddb` where a
database is needed. **All financial correctness lives here.**

- `model/` — zod schemas, inferred types and factories for every table
- `money.ts` — integer-cents arithmetic, parsing and formatting
- `oplog/` — the `Op` union, `apply()`, `replay()` and the canonical total order
- `repo/` — IndexedDB schema and the atomic op-log write path
- `commands/` — pure `Op` builders
- `engine/` — derivations: balances, budgets, goals, plan, recurring, reporting, flows
- `data/` — the export format and full import validation
