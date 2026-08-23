# Fresh-agent development prompt: dashboard widgets

Copy this entire document into a fresh agent context after the owner decisions below are answered.

## Mission

Implement the approved dashboard widgets and dashboard-platform features in `/home/may/github/yaccount`.

Work on **one widget or one platform feature at a time**. Finish its behavior, tests, verification, visual review, and commit before starting the next item. Use one branch for the whole tranche. Do not create or merge a PR until the owner completes human review.

This is a financial application. Exact, deterministic, replay-safe data behavior outranks speed of delivery and visual convenience.

## Read before acting

Read these files completely, in this order:

1. `AGENTS.md`
2. `dashboard-widget-visual-spec.md`
3. `debt-system-research.md` — boundary only; debt is deferred
4. `yaccount-tech-spec-v3.md`, especially invariants, models, reporting, plan, sync, and visual-language sections
5. `yaccount-implementation-details.md`
6. Current dashboard, plan, engine, model, settings, oplog, export, and tests under `src/`
7. `e2e/critical-flows.spec.ts`

Authority order when sources conflict:

1. Owner answers in this prompt
2. `AGENTS.md`
3. Explicit current user instructions
4. `dashboard-widget-visual-spec.md`
5. Locked technical-spec invariants
6. Existing behavior/tests

Do not quietly choose between material conflicts. Ask the owner.

## Owner decisions

Replace every `PENDING` before development, or ask the owner before the affected feature. Recommended answers are provided to reduce basic questions.

### D1. Visual scope

Question: Are all names, merges, compact/expanded mocks, and the curated first dashboard in `dashboard-widget-visual-spec.md` approved?

Recommended: Yes. Small responsive adjustments allowed; semantic or structural changes require approval.
Owner: **Approved.**

### D2. Hidden-from-stats boundary

Question: Should category statistical exclusions affect reporting only, while balance/solvency widgets use the complete ledger?

Recommended: Yes.

- Raw approved ledger: Overall balance, Cash horizon, Container watch, Money map, commitment cash effects, pending review.
- Stats-filtered ledger: What changed, Month landing, Budget triage, Income resilience, Category watch, historical reports.
- Allocation plan keeps all active budgets/goals because it is a plan, not a report.
- Never let “Hide from stats” make cash reappear or disappear from a solvency calculation.

Owner: **Approved.**

### D3. Existing-layout migration and retired widgets

Question: How should existing saved layouts migrate when widgets are replaced or absorbed?

Recommended:

- Reuse stable IDs for one-to-one replacements: `pace` -> Budget triage, `upcoming` -> Cash horizon, `goals` -> Goal outlook.
- Use `saved` as the stable position/preference key for What changed; retire `kpis` after migration.
- Preserve the earliest visible position of absorbed widgets; hide the replacement only when every absorbed predecessor was hidden.
- Do not silently choose a subject for Category watch. Retire `trend` only after presenting an explicit choose-category migration state.
- Preserve existing order, hidden state, folds, and period overrides wherever semantics remain valid.
- Keep old v1 data readable. First v2 write is additive and deterministic; never overwrite or delete v1 data during read.

Owner: **Replace existing saved layouts entirely. Do not migrate v1 layout choices. This is a single-user application, so preserving the current customized setup is unnecessary.**

### D4. Conditional widgets

Question: Should eligibility affect initial curation only, or dynamically remove existing widgets when data disappears?

Recommended: Eligibility controls initial/default inclusion. Once a widget is in a dashboard, it remains in place and shows a directed empty/insufficient-data state. Never make a user's layout jump because a goal, rule, category, or snapshot was archived.

Owner: **Approved.**

### D5. Pay-cycle income boundary

Question: Which recurring income events define a pay cycle when several types of income exist?

Recommended: Allocation-plan settings select one or more active income rules as pay-cycle anchors. Default selection is all active income rules, shown explicitly and editable. Do not add an `is_paycheck` financial-model field solely for this widget.

Owner: **Approved.**

### D6. Month-landing forecast

Question: Approve this v1 formula?

Recommended:

- Actual kept through today: approved stats-visible income minus approved stats-visible expense.
- Remaining scheduled net: future-dated approved rows plus active stats-visible recurring income/expense occurrences. A linked approved or pending row replaces its rule occurrence so the event appears once; a pending row remains expected, never actual.
- Flexible remaining spend: median of non-recurring stats-visible expense from the equivalent remaining portion of the last three complete comparable months. Align portions by elapsed-month fraction: the prior slice starts at `floor(elapsedDays / currentMonthDays * priorMonthDays) + 1`.
- Expected range: minimum to maximum of those three historical remaining-spend observations.
- With two complete months, use their median/range and label **Early estimate**. With fewer than two, scheduled-only and no range.
- Keep refunds signed. Exclude transfers. Show each component in Show the math.

Owner: **Approved.**

### D7. Budget-triage forecast and thresholds

Question: Approve this v1 classification?

Recommended:

1. **Needs attention — spent:** actual spend exceeds effective budget.
2. **Needs attention — projected:** greater of linear day pace and `spent + known remaining scheduled category expense` exceeds budget.
3. **Watch:** projected spend reaches at least 90% of budget, or remaining budget is less than known scheduled category expense.
4. **On track:** everything else.

Rank spent overage first, then projected overage, then smallest projected buffer. Use integer cents and calendar-day fractions. Net refunds within category. Do not forecast from fewer than seven elapsed days; scheduled obligations still apply.

Owner: **Approved.**

### D8. Payee/source normalization

Question: Add editable source aliases now?

Recommended: No. V1 groups by trimmed, whitespace-collapsed, locale-independent case-folded `vendor_source`; preserve the most recent display spelling. Timing explanations must say **likely**. Defer alias/correction UI and model expansion.

Owner: **Approved.**

### D9. Money-map valuation

Question: How should archived and unvalued containers affect Tracked value?

Recommended:

- Exclude archived containers from the current map; detail can link to archived records elsewhere.
- Non-investment value comes from the complete approved ledger.
- Investment value comes from its latest snapshot, regardless of selected report period, with the snapshot date.
- A missing investment snapshot is **Unvalued**, never `$0`.
- Label the total **Known tracked value** when any active container is unvalued; show the unvalued count beside it.

Owner: **Approved.**

### D10. Commitment normalization

Question: Approve this regular/irregular boundary?

Recommended:

- Regular: active fixed expense rules whose configured cadence is monthly or more frequent.
- Irregular: active fixed expense rules whose cadence is longer than monthly.
- For custom cadence, classify by the average interval length; exactly one month is Regular.
- Monthly load is exact occurrences over the next 12 calendar months divided by 12, rounded once to cents for display.
- Irregular monthly equivalent uses the same 12-month horizon.
- Goal-derived/null amounts remain **set later** and do not enter numeric totals.

Owner: **Deferred. More context is required. Build every non-dependent item first; defer Commitments and other D10-dependent work to the end.**

### D11. Synced versus browser-local dashboard state

Question: Approve this persistence split?

Recommended synced state:

- Dashboard definitions, order, default dashboard, widget instances, hidden state, compact/expanded mode, subject selection, container floor, and forecast configuration.

Recommended browser-local state:

- Currently open dashboard, temporary edit draft, collapse state, and each dashboard's selected report/compare period.

Use one setting entity per dashboard rather than one giant JSON bundle. Use a tombstone for deletion; settings have no delete operation. Derive the dashboard list from prefixed setting keys so concurrent dashboard creation cannot lose an entry through one manifest overwrite. Use a deterministic `overview` ID when migrating v1.

Owner: **Approved.**

### D12. Compare mode

Question: How should fixed-current widgets behave when period comparison is active?

Recommended: Render fixed-current widgets once above the two comparison columns. Duplicate only genuinely period-aware widgets. Never show two identical Cash horizon, Goal outlook, Money brief, or current-month cards under different period headings.

Owner: **Keep fixed-current widgets in their existing layout positions. When comparison is active, show on each that period comparison is not supported yet.**

### D13. Month-close acknowledgement

Question: Should close-month dismissal/completion travel across devices?

Recommended: Yes. Store a small synced per-month acknowledgement record as a setting value. Computed completion remains computed; store only explicit dismiss/acknowledge actions. Never store derived balances or checklist truth.

Owner: **Approved.**

### D14. Performance acceptance

Question: Is a structural performance gate sufficient, or does the owner want numeric budgets before work starts?

Recommended structural gate:

- Registry metadata does not eagerly import chart modules.
- Collapsed/off-screen detail does not run heavy transforms.
- Recurring occurrences and shared monthly aggregates compute once per revision/range.
- Large deterministic fixture remains responsive in desktop and mobile Playwright review.
- Record before/after production bundle sizes and flag material growth; do not set flaky wall-clock unit-test limits.

Owner: **Approved.**

### D15. Close-month truth

Question: Should the close checklist avoid claiming that recurring items were “accounted for” when the materialized model cannot always distinguish a deliberately dismissed proposal from every other missing occurrence?

Recommended: Yes. Use only provable copy: pending entries remaining, budgets above allowance, unmatched expected occurrences, and stale values. Let the user explicitly acknowledge the month when satisfied. Do not persist a derived claim that a bill happened. A dismissed recurring proposal may clear Inbox work but must not become an approved actual.

Owner: **Deferred. More context is required. Build every non-dependent item first; defer Month close and other D15-dependent work to the end.**

### D16. Future-dated approved rows

Question: Should a transaction dated after `today` affect current balance immediately or enter the forecast on its date?

Recommended: Current hero, Money map, and forecast starting balance are as-of today. A future-dated approved row enters Cash horizon/Month landing once on its date. This changes the current all-dates balance behavior, so protect it with explicit regression tests and use the same identity everywhere.

Owner: **Approved as the interim dashboard rule. Revisit broader future-dated transaction behavior in [GitHub issue #35](https://github.com/SomewhatMay/yaccount/issues/35) after dashboard widgets and before M10 Capacitor.**

## Explicit scope

Build:

- Dashboard data-semantics separation required by approved answers.
- Dashboard layout v2 with an intentional replacement of v1 layouts per D3.
- Dashboard sets.
- Compact/expanded widget modes.
- Conditional default curation and durable empty states.
- Reusable Show the math surface.
- Lazy/demand-driven widget loading and shared derivations.
- Grouped/searchable widget gallery with instance configuration.
- Money brief, including conditional Month close.
- Allocation plan, including Month and Pay cycle modes.
- Cash horizon, including Until next income and replacement of Coming up.
- Month landing.
- Budget triage, replacing Budget pace.
- Goal outlook, replacing Goals.
- Money map.
- What changed, absorbing Saved this period and Headline figures.
- Commitments with Regular and Irregular modes.
- Income resilience.
- Repeatable Watch instances for a container or category.
- Curated new-user dashboard.

Do not build:

- Debt or liabilities of any kind.
- Recommendation 1's Home reposition/rename.
- Recommendation 10 analytics, telemetry, usage counters, or measurement UI.
- Recommendations 11-15; they do not exist in the source report.
- Native OS widgets.
- Receipts, bank feeds, splits/tags, multi-currency, or household features.
- AI advice, opaque scores, gamification, peer comparison, or “safe to spend.”
- Arbitrary drag resizing.

## Financial-data invariants

These are release blockers.

- Store and calculate money in integer cents. Never use floating dollars for financial arithmetic.
- Core calculation functions are pure and clock-free. Pass ISO dates explicitly.
- Actuals use approved, non-template ledger state and existing void/reversal semantics.
- Pending rows are never actual balances, spending, income, goal contributions, or completed commitments.
- Current balances use the D16 date boundary consistently. Future approved rows are either current or forecast—not both.
- A forecast read never mutates recurring cursors, writes Inbox rows, or changes financial state.
- Distinguish actual transaction, recurring expectation, budget intent, goal ask/contribution, transfer, and dated snapshot.
- Transfers change location once. They are not income, expense, or kept money.
- A recurring occurrence already represented by a linked pending/approved row is not counted twice.
- Refunds and opposite-sign corrections keep their signed meaning.
- Statistical exclusions follow D2; they never silently change raw cash identity.
- Investment values always expose freshness. Unknown is never zero.
- Forecasts visibly separate actual from projected values and expose assumptions.
- Derived values are not persisted. Persist only user choices or source records.
- Synced writes go through commands/oplog/dispatch. No direct IndexedDB mutation.
- Every stored format has runtime validation, a version, deterministic migration, malformed-input fallback, and round-trip tests.
- Preserve replay, export/import, sync convergence, and older-row parsing.
- Never delete, overwrite, or silently reinterpret financial records to support a widget.
- Stable widget IDs/preferences follow D3. Never “fix” a registry test by simply changing its expected IDs.

## Dashboard data contract

Do not continue using one ambiguous `transactions` field for every widget. Introduce names that encode semantics, for example:

```text
WidgetContext
|-- ledgerTransactions      complete ledger for balance/location semantics
|-- reportTransactions      category-stat exclusions applied
|-- categories
|-- containers
|-- budgetTargets
|-- recurringRules
|-- goals
|-- snapshots
|-- settings or resolved user choices
|-- today
`-- range
```

Use the narrowest correct stream in each engine. Add regression tests proving hidden statistical categories cannot falsify cash and raw categories cannot leak into reporting widgets.

## Dashboard persistence recommendation

Implement only after D11 approval. Suggested v2 setting shape:

```text
dashboard.v2.item.<dashboard-id> = {
  version: 2,
  id,
  name,
  rank,
  isDeleted,
  instances: [
    {
      instanceId,
      widgetType,
      size: "compact" | "expanded",
      hidden,
      subject?,
      settings?
    }
  ]
}

dashboard.v2.default = "<dashboard-id>"
```

Requirements:

- Validate with Zod or equally explicit runtime validation.
- Curated built-in instance IDs are deterministic; generated stable IDs distinguish later instances.
- Derive dashboard membership from `dashboard.v2.item.` keys only; reserved metadata keys are not dashboard records.
- When no v2 data exists, resolve the curated deterministic Overview dashboard. Do not migrate v1 layout choices.
- First save writes v2; v1 remains untouched as fallback/history.
- Unknown widget types remain preserved in stored data even if omitted from rendering, so a temporary older/newer client does not erase them on save.
- Deleted dashboard uses a tombstone. At least one active dashboard always resolves.
- Per-dashboard LWW is acceptable; one dashboard edit must not overwrite unrelated dashboards.
- Duplicate creates new dashboard and instance IDs while preserving configuration.
- Active-dashboard preference is local and validates against active IDs.

If this representation conflicts with repo sync behavior after deeper inspection, stop and propose a tested alternative before writing it.

## Strict TDD workflow

TDD is mandatory for every behavior change.

For each platform feature or widget:

1. Read its complete visual-spec section and relevant current code/tests.
2. State the exact behavior slice being implemented. Do not bundle the next widget.
3. Resolve any material math, schema, migration, or UX question with the owner.
4. Write the smallest failing pure-engine/model test first where applicable.
5. Run the targeted test and confirm it fails for the intended missing behavior—not a syntax, fixture, or environment error.
6. Write minimum core/model implementation to pass.
7. Add a failing component/integration test for visible behavior and interaction.
8. Confirm that failure, then implement minimum UI.
9. Add edge, accessibility, migration, and regression cases appropriate to the slice.
10. Run targeted tests, then full `npm test`.
11. Run `npm run typecheck`, `npm run lint`, and `npm run format:check`.
12. Run relevant Playwright coverage on both desktop and mobile for UI behavior.
13. Inspect light/dark and 390px/desktop visuals. Compare against the approved ASCII character and information hierarchy.
14. Review `git diff --check` and the complete feature diff.
15. Commit the completed green slice before beginning another widget/feature.

Never:

- Write behavior implementation before its failing test.
- Edit a test merely to make failing implementation pass.
- Skip or weaken an invariant assertion because implementation is inconvenient.
- Commit known-red behavior.
- hide a new flaky test with retries, sleeps, `.skip`, or broad timing tolerances.
- Mix two widgets in one behavioral commit.

Docs, comments, formatting, config-only changes, and renames are exempt from test-first only as stated by `AGENTS.md`. If a behavior is genuinely untestable, say so before changing it and provide the manual verification.

## Branch and commit discipline

At session start:

1. Run `git status --short`, `git branch --show-current`, and inspect recent history.
2. Preserve all existing/untracked user files. The three dashboard research/handoff documents are intentional.
3. From current `main`, create one branch: `feat/dashboard-widgets` unless the owner specifies another.
4. Run and record baseline `npm test`, typecheck, lint, format check, build, and relevant current E2E.
5. Commit the approved research/spec/handoff documents in a docs-only commit before behavior, if the owner has not already committed them.

Commit requirements:

- At least one commit per widget.
- At least one commit per standalone dashboard-platform feature.
- More commits are encouraged when model/engine/UI slices are independently coherent.
- Each commit is green and reviewable.
- Commit only files belonging to the current slice; preserve unrelated worktree changes.
- Use concise messages, e.g. `feat: add cash horizon widget`.
- Do not mention or co-author with Codex or another agent.
- Do not push or open a PR before owner human review.

After each commit, report:

- feature/widget completed;
- commit hash;
- tests run;
- remaining known limitations;
- any owner decision needed before the next item.

## Recommended implementation order

The order minimizes repeated migrations and lets later widgets reuse proven engines. Changing it requires a concise dependency rationale.

1. Dashboard data-semantics split (`ledgerTransactions` vs `reportTransactions`).
2. Layout v2 codec, deterministic v1 replacement, and persistence tests.
3. Dashboard sets UI and lifecycle.
4. Compact/expanded shell, durable eligibility states, and reusable Show the math surface.
5. Lazy widget modules/shared aggregate boundary.
6. Grouped/searchable gallery and configured instance creation.
7. Money map.
8. What changed.
9. Budget triage.
10. Goal outlook.
11. Commitments.
12. Cash horizon.
13. Allocation plan: Month mode reuse, then Pay cycle mode.
14. Month landing.
15. Income resilience.
16. Watch instances: Container, then Category.
17. Money brief and conditional Month close.
18. Curated defaults, legacy-widget retirement, final migration integration.

Each numbered item is a stop boundary. Finish and commit it before item `n + 1`.

## Widget-specific minimum tests

These supplement, not replace, the visual spec.

### Money map

- Exclusive branches reconcile to known tracked value exactly.
- Overall-balance branch matches raw balance identity.
- Counted goal/investment is not double-counted.
- Latest snapshot chosen deterministically; missing snapshot is unvalued.
- Archived containers follow D9.
- Compact and expanded accessible summaries expose the same total.

### What changed

- Equal-length preceding range across month/year/leap boundaries.
- Income, spending, kept, and drivers reconcile exactly.
- Transfers excluded; refunds net correctly; stats exclusions honored.
- Driver ordering is deterministic; Everything else closes the sum.
- Likely timing language never becomes an asserted fact.
- No preceding range produces directed setup copy.

### Budget triage

- Effective time-variant budget chosen correctly.
- Actual overage, projected overage, Watch, and On track boundaries from D7.
- Refunds, zero budget, first six days, month end, leap month.
- Remaining linked scheduled expense cannot double-count a pending/approved row.
- Stats exclusions honored.
- Exact category/month deep link.

### Goal outlook

- Deadline, fixed, and passive modes.
- Reserve versus spend-down basis.
- Fixed/passive goal without target does not invent completion.
- Pending transfer does not advance progress.
- Required monthly and projected completion reuse existing engines.
- Completed/archived/cancelled goals leave active view without moving the widget.

### Commitments

- Daily, weekly, twice-monthly, monthly, annual, and custom cadence boundaries.
- Start/end/cancelled rules.
- Expense only; income and transfers do not lower load.
- Null goal-derived amount excluded and labeled.
- Exact 12-month occurrence normalization and rounding.
- Feb/leap/month-end recurrence behavior reuses recurring engine.

### Cash horizon

- Starts from raw selected cash balance as of today per D16.
- Future-dated approved rows enter once on their dates and are not in the starting balance.
- Applies income, expense, and transfer occurrences once in deterministic date order.
- Transfer between included containers cancels; crossing boundary changes total once.
- Pending/approved linked occurrence de-duplication.
- Low point/date, first zero crossing, largest shortfall, and next-income landmark.
- No active rules, no income, null amount, archived/excluded containers.
- Reading the forecast writes nothing.

### Allocation plan

- Month mode reuses `monthlyPlan`; do not fork locked formula.
- Recurring income versus synced manual monthly-income fallback.
- Pay-cycle anchor selection and multiple income streams from D5.
- Exact inclusive/exclusive cycle boundary.
- Flexible budget pro-rating, month boundary, and goal asks.
- Transfers excluded except existing goal contribution semantics.
- Negative result says plan exceeds income; never “safe to spend.”

### Month landing

- D6 components reconcile exactly to likely kept.
- Future-dated approved rows and scheduled occurrences appear once, on the forecast side.
- Linked recurrence de-duplication.
- Two months Early estimate; three months full range; fewer scheduled-only.
- Month/day alignment including February and 31-day months.
- Refunds, variable income, zero-spend months, stats exclusions, transfers.
- Range order and rounding deterministic.

### Income resilience

- Fewer than six complete months is ineligible/directed.
- Current partial month excluded.
- Median for even/odd month count; observed min/max.
- D8 normalization and deterministic display spelling.
- Negative income corrections net correctly.
- Largest-source share and Steady 5% boundary.
- Scheduled fixed income is descriptive, never guaranteed.

### Watch instances

- Multiple instances of same type/subject have stable unique IDs.
- Container uses raw ledger; Category uses stats-filtered expenses.
- User floor exact boundary; no inferred floor.
- Transfer direction and container forecast.
- Refunds, budget changes, category month projection.
- Archived/missing subject keeps instance and prompts Choose another.
- Duplicate/reorder/hide/size/sync/export round-trip.

### Money brief / Month close

- Priority order and three-item cap.
- Does not duplicate ordinary Cash-horizon items.
- Pending count uses complete pending ledger.
- Budget/stale-snapshot/recurrence checks use correct data stream.
- Close window: last three and first five days across year/leap boundaries.
- Computed items versus explicit acknowledgement from D13.
- All-clear and incomplete-data copy.
- Every action lands on a useful source screen.

### Dashboard sets and gallery

- Malformed v2, unknown version/type, duplicate IDs, tombstones, no active dashboard.
- Deterministic v1 replacement resolves the curated Overview and leaves v1 data untouched per D3.
- Create, rename, duplicate, reorder, default, delete, and last-dashboard protection.
- Concurrent independent dashboard settings survive merge/replay.
- Active dashboard is browser-local and falls back if deleted.
- Period/compare scope from D11/D12.
- Search by title/description/recognition terms.
- Suggested, grouped, Needs setup, and configured Watch creation.
- Keyboard, touch, focus, screen-reader names, mobile sheet scrolling.

## Visual implementation law

Follow the existing Standing Register; do not redesign it.

- Reuse `Figure`, `Marginalia`, `Eyebrow`, `LeaderRow`, `RuledTotal`, `Money`, `RowActions`, `ResponsiveSheet`, and existing chart primitives.
- Fraunces: display moments only. Geist: UI/prose. Geist Mono plus tabular numerals: every amount/count.
- Semantic tokens only. Emerald means money in only. Destructive means actual shortfall/missed obligation only.
- Overall balance remains the sole hero.
- The forecast stitch is the one new signature: solid actuals end at today; dotted forecast begins there. It must also be understandable without color.
- Rules appear only above totals. Dot leaders only in sparse summaries.
- No decorative gradients, generic statistic-card grids, traffic-light scoring, gauges, excess badges, or extra animation.
- Quick-add remains the sole orchestrated motion. New widgets use only existing subtle interaction motion.
- Mobile has no horizontal page scroll. Touch targets remain usable. Reduced motion and both themes are mandatory.
- Empty states direct one action. Errors name what failed and what to do.
- Show the math uses one reusable responsive surface, not bespoke explanations per widget.

## Performance implementation law

Follow D14.

- Keep registry metadata separate from heavy render modules.
- Prefer shared pure aggregate inputs over identical `useMemo` work in several widgets.
- Do not introduce a global cache whose invalidation can serve stale money. Cache keys must include every input revision/date/config that affects the result, or use render-scoped memoization.
- Closed widget detail must not derive charts.
- Off-screen heavy modules should load near viewport, while compact text remains available.
- Preserve error boundaries per widget.
- Measure production bundle change after each chart-heavy widget.
- Correctness wins if optimization would obscure invalidation or date semantics.

## Final automated verification

Before asking for human review, run from a clean worktree state:

```text
npm test
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run test:e2e
git diff --check
```

Run Playwright in both configured desktop and mobile projects. Report exact pass/fail counts and any pre-existing failure separately. Do not claim complete with a skipped new behavior or unexplained failure.

Also review:

- `git status --short`
- `git log --oneline main..HEAD`
- final diff for accidental debt/telemetry/scope expansion
- migration/replay/export tests
- production bundle output

## Human-review handoff before PR

Do not open a PR. Give the owner:

1. Commit list grouped by platform feature/widget.
2. Automated command results.
3. Known limitations or deferred decisions.
4. A numbered manual test list with expected result for every item below.

Minimum human test scenarios:

- Fresh account and sparse account: no meaningless empty-card wall.
- Existing v1 customized dashboard migrates without losing order/hidden choices.
- Create, rename, duplicate, reorder, make default, and delete dashboards; reload after each.
- Compact/expand/hide/re-add/reorder widgets on desktop and mobile.
- Gallery search, groups, Needs setup actions, and Watch configuration.
- Light/dark, desktop/390px, keyboard-only, touch, and reduced motion.
- Hide a category from stats: reports change; raw cash/map/horizon stay financially correct per D2.
- Income/expense/transfer/refund/pending/void scenarios reconcile by hand.
- Multiple recurring incomes and bills; next-income and pay-cycle boundaries.
- Transfer within selected cash, transfer across selection, investment transfer.
- Budget under/near/projected-over/actually-over, including scheduled expense and refund.
- Goal deadline/fixed/passive and reserve/spend-down behavior.
- Investments current/stale/missing snapshot; map total and unvalued state.
- Month landing with zero, one, two, and three-plus complete months; verify Show the math manually.
- Income resilience with concentrated, variable, corrected, and sparse income.
- Multiple Container/Category Watch instances; floor and archived subject.
- Money brief priority, cap, all-clear, month-end, and acknowledgement.
- Compare mode: current widgets once and period widgets aligned per D12.
- Browser restart persistence, two-device sync/merge where practical, export/import round-trip.
- Long dashboard scrolling and first-load behavior with a large fixture.
- No debt, telemetry, usage measurement, or Home rename appeared.

End the handoff by asking the owner to complete this review and report corrections. Only after owner approval may a PR be created.

## Communication rule

Ask before a widget only when an unanswered point can materially change financial math, stored data, migration, or approved interaction. Make ordinary implementation judgments yourself, document them briefly, and keep moving. Never use that permission to guess at money semantics.
