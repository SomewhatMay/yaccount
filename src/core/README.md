# src/core — platform-agnostic domain logic

Pure TypeScript. **Never** imports React, Next, Capacitor, or drivestore (enforced by
the ESLint boundary rule in `eslint.config.mjs`). Fully unit-testable in Node with
`fake-indexeddb`. This is where all financial correctness lives (impl §2, §0.6).

Populated starting at M1: `model/`, `money.ts`, `oplog/`, `repo/`, `engine/`, `reporting/`.
