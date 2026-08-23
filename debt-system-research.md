# Future debt system research brief

Status: intentionally deferred
Purpose: preserve debt-related research, user demand, design rationale, candidate widgets, and technical requirements for a dedicated future update
Current implementation: none

This brief records conclusions and decision rationale. It does not expose private chain-of-thought; it preserves the evidence, tradeoffs, and requirements needed to resume the work.

## Executive decision

Debt must be a first-class subsystem, not a negative container plus a payoff chart.

The current app can store signed balances and transfers, but it cannot correctly express debt type, principal, APR, interest method, statement and due dates, minimums, fees, promo-rate tranches, payment allocation, or lender reconciliation. Building a dashboard card first would create precise-looking fiction.

All debt widgets and debt-adjacent Review items are deferred together. No current widget may claim debt-free dates, interest savings, credit utilization, debt-adjusted net worth, or safe extra payments until the foundation below exists.

## Current yaccount boundary

What exists:

- Containers have name, investment flag, overall-balance inclusion, and archive status.
- Approved ledger rows produce balances; a transfer is one negative source row that credits its destination.
- Container snapshots can record signed reported values as of a date.
- Recurring rules can schedule fixed income, expense, or transfer proposals.
- Goals can express a target, deadline, fixed monthly contribution, or passive progress.
- Overall balance is an opt-in spendable-style headline, not net worth.

What is missing:

- Asset versus liability semantics.
- Revolving credit versus installment-loan semantics.
- Statement balance, current principal, original principal, or available credit.
- APR, interest accrual, compounding, capitalization, or rate changes.
- Minimum-payment formula, due date, statement date, or delinquency state.
- Principal/interest/fee allocation within a payment.
- Multiple balance tranches on one card.
- Payoff, amortization, refinancing, or multi-debt strategy engine.
- Statement reconciliation specific to lender-reported debt.

Why the existing transfer identity is insufficient:

```text
  CURRENT ASSET TRANSFER

  Checking -- payment --> another ordinary container
       -$500                         +$500
  total tracked assets: unchanged

  REQUIRED DEBT SEMANTICS

  Checking -- payment --> liability
       -$500             principal -$412
                         interest   +$78 expense
                         fee        +$10 expense

  cash falls $500; amount owed falls $412; spending rises $88.
  A plain transfer cannot derive that split safely.
```

A signed snapshot can display a reported negative balance, but it does not explain how payments, purchases, interest, and fees changed it. It is a reconciliation input, not a debt model.

## Research synthesis

### Market capabilities worth preserving

| Evidence | Capability | Product implication |
|---|---|---|
| [YNAB Loan Planner](https://www.ynab.com/blog/ynab-loan-planner) | Extra monthly and one-time payment scenarios; time and interest saved; payoff chart; budget connection | Simulations must show both time and cost impact, then connect the chosen payment to a funded plan. |
| [YNAB debt management](https://www.ynab.com/features/debt-management) | Loan payoff progress and simulator; separate credit-card handling | Loans and revolving credit need different engines and UI. |
| [YNAB interest guide](https://support.ynab.com/en_us/handling-interest-in-loan-accounts-a-guide-r1Y17LAkj) | Calculated interest can differ from the lender and must be editable | Lender statement wins; calculated interest is forecast until reconciled. |
| [Quicken Debt Reduction Planner](https://info.quicken.com/win/how-do-i-create-a-debt-reduction-plan) | Finds eligible loan/card accounts and optimizes a payment schedule | Debt inventory and include/exclude controls precede strategy comparison. |
| [Undebt.it](https://undebt.it/pricing-features-reviews.php) | Multiple payoff methods, side-by-side comparison, month schedule, utilization | Snowball/avalanche alone is too narrow; custom order and transparent comparison matter. |
| [Tiller debt payoff templates](https://tiller.com/resources/personal-finance-spreadsheet-templates/debt-payoff-spreadsheet-templates/) | Coordinated inventory, calculators, payment tracker, dashboard | The app should unite plan, actual payment tracking, and progress rather than export math back to a spreadsheet. |
| [CFPB mortgage amortization explainer](https://www.consumerfinance.gov/ask-cfpb/how-does-paying-down-a-mortgage-work-en-1943/) | Payment splits change over time; escrow may also be present | Mortgage payments need principal, interest, and non-debt components, not one amount. |
| [CFPB promotional financing guidance](https://www.consumerfinance.gov/ask-cfpb/i-got-a-credit-card-promising-no-interest-for-a-purchase-if-i-pay-in-full-within-12-months-how-does-this-work-en-40/) | Deferred interest, promo deadlines, minimums, and allocation rules can interact | A single APR field cannot model many real revolving balances safely. |
| [CFPB credit-card terms](https://www.consumerfinance.gov/consumer-tools/credit-cards/answers/key-terms/) | APRs, balance-transfer fees, temporary rates, and limits have distinct meanings | Store terms explicitly; never infer a refinance or balance-transfer benefit from APR alone. |

### User-demand findings

The strongest repeated needs are not “more debt charts.” They are missing semantics and decision support.

| Demand signal | Need | Strategic response |
|---|---|---|
| [Principal-payment visibility request](https://www.reddit.com/r/ynab/comments/1u07ucs/tracking_credit_card_principal/) | Users cannot see payments net of interest and new purchases | Show principal reduction, interest, fees, and new borrowing as separate flows. |
| [Total debt on the homepage request](https://www.reddit.com/r/ynab/comments/15giczr/ynab_separate_app_to_watch_debt_progress/) | People want visible aggregate progress, not a buried net-worth filter | Future Home may host one compact Debt freedom surface after debt data is trustworthy. |
| [More robust scenario demand](https://www.reddit.com/r/ynab/comments/1reg6gi/debt_tracking/) | Basic monthly-payoff targets do not replace multi-method planning | Compare strategies and custom order with exact assumptions. |
| [Multiple APR and payoff-date request](https://www.reddit.com/r/ynab/comments/18no812/visualising_credit_card_payoff/) | One account may mix promo and ordinary balances; users want extra-payment impact | Model balance tranches and payment-allocation rules before simulating revolving debt. |
| [Historical progress motivation](https://www.reddit.com/r/ynab/comments/1uvqpil/debt_payoff_tracker/) | Users want to see how far they have come, including payments before setup | Support opening principal/date or imported historical adjustments without corrupting current balance. |
| [Debt-management-plan allocation](https://www.reddit.com/r/ynab/comments/1vuqa3i/how_to_handle_debt_management_plan_reporting/) | One cash payment may split across several debts and an agency fee | A debt payment event may have multiple liability legs plus expense legs. |
| [Credit-card principal versus transfers](https://www.reddit.com/r/ynab/comments/1l7muja/tracking_credit_card_balance_payments_as_debt/) | Principal is a balance-sheet transfer but still feels like a major cash commitment | Cash-flow and debt-progress views must show the same payment with different, clearly named semantics. |

Distilled demand hierarchy:

1. Balance accuracy and statement reconciliation.
2. Due/minimum protection.
3. Principal-versus-interest visibility.
4. Credible debt-free date.
5. Extra-payment impact.
6. Multi-debt prioritization.
7. Progress and motivation.
8. Credit-utilization and promo-expiry awareness.
9. Debt-aware cash planning and net worth.

## Candidate widget inventory

Every candidate below remains deferred. “Foundation” means it may be a core debt screen or Home widget; final placement is a future design decision.

| Candidate | Future decision | One-line rationale |
|---|---|---|
| Debt freedom | Strong keep candidate | One aggregate owed figure, payoff trajectory, and next milestone answer the most common Home request. |
| Debt command center | Strong keep candidate | A dedicated surface can combine balances, minimums, due dates, strategy, and exceptions without overloading Home. |
| Principal progress | Strong keep candidate | Principal reduction is the clean progress measure users cannot extract from ordinary spending reports. |
| Interest drain | Strong keep candidate | Current and lifetime interest reveal the cost that balance-only progress hides. |
| Extra payment impact | Strong keep candidate | Time saved and interest avoided make a concrete optional payment understandable. |
| Strategy comparison | Strong keep candidate | Avalanche, snowball, minimum-only, and custom order need side-by-side outcomes before commitment. |
| Payment calendar | Strong keep candidate | Missing a minimum is materially different from drifting off an optimal strategy. |
| Debt payoff timeline | Strong keep candidate | A month-by-month schedule makes the plan auditable and exportable. |
| Promo expiry watch | Strong keep candidate | Deferred/introductory rates can create discontinuous risk that ordinary APR displays miss. |
| Credit utilization | Review in revolving-credit phase | Useful only with correct limits, statement timing, and scope; never a proxy credit score. |
| Minimum-payment coverage | Strong keep candidate | Cash horizon must reserve known minimums before suggesting extra payment capacity. |
| Debt-aware Cash horizon | Strong keep candidate | Debt obligations should enter the common dated cash forecast after minimum semantics exist. |
| Debt versus buffer scenario | Review carefully | It can compare outcomes, but must not prescribe sacrificing emergency liquidity. |
| Refinance/consolidation scenario | Review carefully | Useful only when fees, term reset, variable rates, and promo rules are modeled. |
| Balance-transfer scenario | Review carefully | Fees, lost grace period, allocation order, and promo expiry make simplistic savings claims dangerous. |
| Debt-management-plan allocator | Review for affected users | Multi-leg payment support solves a real case but should not shape the first loan MVP. |
| Statement reconciliation | Foundation, not optional | Forecast balances must yield to lender-reported truth with explicit adjustment history. |
| Payment split inspector | Foundation, not optional | Users need to see principal, interest, fee, escrow, and adjustment legs. |
| Debt-adjusted net worth | Keep after liabilities | True net worth becomes meaningful only when liability balances are complete and fresh. |
| Mortgage equity | Review in mortgage phase | Principal is not home equity without an independently dated asset value. |
| Debt-free milestones | Keep with restraint | “First account closed” and percentage milestones aid orientation; no confetti, shame, or streaks. |
| Interest-rate change watch | Review in variable-rate phase | Valuable for variable APR/ARM products once rate schedules exist. |
| New-borrowing detector | Review for revolving credit | Separating purchases from interest and principal exposes whether payoff is actually progressing. |
| Payment-to-income load | Review carefully | Descriptive DTI-like math may help planning, but must disclose scope and avoid underwriting claims. |
| Custom debt watch | Keep via widget instances | Watching one chosen liability mirrors Container/Category watch without auto-creating clutter. |

## Ideas deliberately rejected

| Idea | Decision explanation |
|---|---|
| Debt health score or letter grade | Opaque judgment hides the exact balance, rate, due date, and tradeoff. |
| Shame copy or red page state | Debt is sensitive; warnings should name a missed obligation, not judge the person. |
| Peer debt comparison | Other users' balances provide little decision value and create privacy pressure. |
| Confetti/streak gamification | It turns a long, uneven financial process into retention theater. |
| AI-selected payoff plan | A recommendation without auditable math and user priorities is unsafe and unnecessary. |
| “Safe extra payment” from balance alone | Unknown expenses and liquidity needs make the claim false. |
| Estimated credit score | Utilization is only one input; presenting a score would imply unavailable bureau data. |
| One universal debt calculator | Revolving, installment, mortgage, student, medical, and DMP terms do not share enough semantics. |
| Hard-coded widget per loan type | A configurable debt instance and a dedicated debt screen provide variety without registry bloat. |

## Domain model requirements

The exact schema should be designed with tests and migration review later. These are semantic requirements, not a proposed final table layout.

### Debt account

| Field | Why needed |
|---|---|
| Stable ID and linked container/account ID | Integrates append-only operations, transfers, and dashboard instances. |
| Kind | At least revolving, installment, mortgage, student, medical, line of credit, DMP, other. |
| Status | Active, paid, closed, deferred/forbearance where relevant; history remains visible. |
| Currency | Even while multi-currency is deferred, schema assumptions must be explicit. |
| Opened/origination date | Historical schedule and term calculations. |
| Original principal or opening owed balance | Progress since setup or origination. |
| Current statement-reconciled balance | Authoritative amount owed as of a date. |
| Lender label | Recognition and statement matching. |
| Payment source container | Cash forecast and recurring proposal integration. |
| Due-day and statement-day rules | Minimum protection and revolving utilization timing. |
| Grace-period semantics | Revolving-interest correctness. |
| Credit limit | Utilization and available-credit math. |
| Original term and maturity | Installment schedule comparison. |
| Escrow or non-debt payment component | Mortgage payment accuracy. |

### Rate segment

One debt may have multiple simultaneous or sequential rate segments.

| Field | Why needed |
|---|---|
| Balance bucket | Purchase, balance transfer, cash advance, deferred-interest purchase, subsidized principal, etc. |
| APR and fixed/variable status | Basic cost and rate-change behavior. |
| Effective start/end | Introductory and future rate schedules. |
| Post-promo APR | Avoid a zero-rate cliff disappearing from forecasts. |
| Accrual method | Daily periodic, simple daily, monthly compound, other/manual. |
| Deferred-interest behavior | Retroactive accrual differs from ordinary 0% APR. |
| Payment allocation priority | Extra payments may not reduce the bucket the user expects. |
| Accrued unpaid interest | Student/forbearance and capitalization cases. |

### Minimum-payment rule

Support statement-entered minimum as truth first. Formula support can explain future minimums.

- Fixed amount.
- Percent of balance.
- Interest plus percent of principal.
- Greater of fixed amount or percentage.
- Promotional fixed plan.
- Lender-reported/manual only.
- Floor, cap, past-due addition, fee addition, and final-payment behavior.

### Debt event

```text
  debt event
  |
  +-- purchase/new borrowing ---- increases owed; expense already recognized
  +-- payment -------------------- decreases cash
  |   +-- principal -------------- decreases owed
  |   +-- interest --------------- expense; does not decrease principal
  |   +-- fee -------------------- expense; may increase owed
  |   `-- escrow/other ----------- not principal; classified explicitly
  +-- interest accrual ----------- increases owed until paid/capitalized
  +-- lender adjustment ---------- reconciles to statement with reason
  +-- refinance/transfer --------- closes/moves principal; preserves lineage
  `-- forgiveness/write-off ------ explicit non-payment balance reduction
```

Required event properties:

- Event date and entered-at instant.
- Debt account and payment source.
- Total amount plus exact component allocation.
- Statement period or external reference when available.
- Actual versus projected status.
- Link to an originating recurring rule or planned payoff action.
- Reversal/correction lineage consistent with the append-only ledger.
- Notes without relying on them for computation.

### Strategy plan

| Field | Why needed |
|---|---|
| Included debts | Some debts may be excluded by contract or user priority. |
| Method | Minimum-only, avalanche, snowball, custom order, possibly hybrid later. |
| Monthly debt budget | Total capacity after minimums. |
| One-time payments | Bonus/refund scenarios without rewriting the ongoing plan. |
| Start date | Aligns statements, interest, and current budget. |
| Rollover policy | Whether freed minimums move to the next debt. |
| User constraints | Promo deadline, protected debt, required order, minimum liquidity. |
| Assumption snapshot | Makes past simulation results reproducible and explainable. |

## Accounting semantics

### Non-negotiable identities

```text
  net worth = current assets - current liabilities

  debt principal change
    = new borrowing
    + capitalized interest
    + principal-increasing fees/adjustments
    - principal payments
    - forgiveness/write-offs

  cash payment
    = principal
    + paid interest
    + fees
    + escrow/other

  spending impact of payment
    = paid interest + fees + classified non-principal expenses

  principal is NOT spent twice:
    purchase/loan-funded expense is recognized when incurred;
    later principal payment changes cash and liability, not expense.
```

### View semantics

- Cash flow shows the full cash payment leaving its source.
- Spending reports show interest, fees, and newly purchased goods/services; not principal again.
- Debt progress shows principal movement, new borrowing, interest added, and adjustments.
- Net worth shows liability balance regardless of whether payment principal is classified as spending.
- Allocation reserves minimum and chosen extra payment capacity without pretending either already happened.
- A pending proposal changes no actual balance.

### Reconciliation policy

- Lender-reported statement balance is authoritative as of its statement date.
- The app shows calculated-versus-reported difference before recording an adjustment.
- Adjustments are append-only events with a reason; no silent overwrite.
- Interest and fee allocation may be edited to match the statement.
- A reconciled point anchors future projection; earlier variance remains visible.
- “Current” always includes its as-of date and source.

## Calculation engines

Separate pure engines are preferable to one branching calculator.

### Installment engine

- Fixed and variable rates.
- Payment cadence and exact due dates.
- Amortization split by period.
- Extra principal with lender application timing.
- Remaining term, payoff date, total interest, and schedule.
- Manual interest/statement override without corrupting subsequent projections.

### Revolving-credit engine

- Statement cycles and due dates.
- Statement balance versus current balance.
- Grace-period state.
- Multiple APR buckets and allocation priority.
- New purchases, cash advances, fees, and balance transfers.
- Minimum calculation or lender-reported minimum.
- Promo and deferred-interest expiry.
- Utilization by account and aggregate limit, scoped to reported balances/dates.

### Multi-debt strategy engine

- Pay all minimums before any extra allocation.
- Compare minimum-only, avalanche, snowball, and user-ordered plans.
- Roll freed minimums according to an explicit setting.
- Honor promo deadlines and debts excluded from extra payment.
- Produce payoff date, total interest/fees, month-by-month schedule, and each debt's close date.
- Show strategy differences, not declare a universally best plan.

### Scenario engine

- One-time extra payment.
- Recurring extra amount.
- Payment rounding.
- Income windfall on a chosen date.
- Refinance or balance transfer with all fees and term changes.
- Temporary payment pause or rate change.
- Liquidity floor as a constraint, never an inferred recommendation.

Every engine result needs an assumption manifest suitable for **Show the math**.

## Accuracy and edge-case inventory

Do not call a debt engine ready until each applicable item has an explicit supported, manual-only, or out-of-scope decision.

### General

- Irregular first/last periods and day-count conventions.
- Leap years and month-end due-date clamping.
- Rounding per day, statement, component, or payment.
- Payment posting date versus initiated date.
- Fees that are paid immediately versus capitalized.
- Late, missed, partial, returned, and reversed payments.
- Negative amortization.
- Prepayment penalty.
- Refinancing lineage and closing costs.
- Forgiveness, settlement, charge-off, and tax consequences: track only; no tax advice.
- Joint/co-signed responsibility versus ownership: household support remains deferred.

### Revolving credit

- Statement versus current balance.
- Purchase, transfer, and cash-advance APR buckets.
- Variable APR index and margin.
- Intro APR versus deferred interest.
- Lost grace period and trailing/residual interest.
- Allocation above minimum across APR buckets.
- Promo deadline distinct from payment due date.
- Credit-limit changes and statement-timed utilization.
- Card still used while old principal is being paid down.

### Installment and mortgage

- Simple daily versus monthly interest.
- Interest paid in arrears.
- Escrow, tax, insurance, and mortgage insurance.
- Biweekly payments versus twice-monthly payments.
- Adjustable-rate reset schedules and caps.
- Interest-only periods and balloon payments.
- Subsidized/unsubsidized student-loan interest and capitalization.
- Forbearance, deferment, income-driven or graduated payments.

### Debt management plans

- One bank withdrawal split across multiple debts.
- Agency fee as a separate expense.
- Closed cards still carrying principal.
- Negotiated rates and minimums.
- Lender balances drifting from agency allocation.

## UX and safety principles

- Exact money and dates use the existing register typography and semantic tokens.
- Debt owed is neutral ink by default. Warning color is for a missed minimum, expired promo, or projected shortfall—not for having debt.
- Start with “amount owed” and “next obligation,” not a score.
- Show actual history as solid and projections as dotted, consistent with dashboard forecast semantics.
- Every forecast names rate, payment, extra amount, start date, and whether interest is exact or estimated.
- Progress can be motivating without celebration mechanics: principal paid, remaining amount, and time saved are sufficient.
- Provide exportable month-by-month math.
- Avoid individualized legal, tax, credit-score, bankruptcy, or refinancing advice.
- When terms exceed model support, require manual projection or mark the simulation unavailable; never fall back silently.

## Proposed future phases

### Phase 0: debt discovery and model lock

- Interview revolving, installment, mortgage, student-loan, and DMP users.
- Collect anonymized statement shapes and lender calculation examples.
- Decide signed storage and asset/liability integration.
- Lock supported products and explicit non-goals.
- Write accounting identities and golden calculation fixtures before UI.

### Phase 1: liability foundation

- First-class liability account and debt event model.
- Statement balance logging and reconciliation.
- Payment component inspection/editing.
- Recurring minimum and due-date integration.
- Accurate total owed and principal history.

### Phase 2: installment planner

- Amortization engine.
- Monthly/one-time extra-payment scenarios.
- Payoff date, interest, and time-saved outputs.
- One-account Debt freedom and payoff timeline.

### Phase 3: multi-debt planning

- Debt inventory and inclusion controls.
- Snowball, avalanche, minimum-only, and custom strategies.
- Rollover payments and month schedule.
- Strategy comparison and chosen-plan funding.

### Phase 4: revolving credit

- Statement/current balance, limits, and utilization.
- Multiple APR buckets, minimum formulas, promos, and grace periods.
- Principal/new-borrowing/interest split.
- Promo expiry and balance-transfer scenarios.

### Phase 5: dashboard integration

- Debt freedom compact widget.
- Payment calendar and Money brief obligations.
- Debt-aware Cash horizon and Allocation plan.
- Debt-adjusted net worth/true Money map.
- Custom debt Watch instances.

### Phase 6: specialized products

- Mortgage equity only with independently dated asset values.
- Student-loan modes.
- Debt-management-plan allocation.
- Refinance/consolidation scenarios.

## Release gates

- Golden schedules match independent lender/calculator fixtures under documented rounding.
- Statement reconciliation reaches the reported cent or records an explicit adjustment.
- Principal, interest, fee, and escrow components reconcile to every payment.
- Actual and projected events cannot be confused visually or in accessible text.
- Every simulation can reproduce its assumptions.
- Unsupported terms block simulation with a specific explanation.
- A debt payment appears correctly in cash flow, spending, debt progress, and net worth without double counting.
- Minimums enter Cash horizon before extra-payment scenarios.
- Large-fixture performance remains within an agreed budget.
- Security/privacy review covers sensitive lender and debt metadata.

## Decisions to make when work resumes

1. Which debt type ships first: fixed installment or revolving credit?
2. Store liabilities in the existing container ledger or a linked debt ledger?
3. Positive “amount owed” domain values versus negative accounting balances?
4. How are interest and fee components represented in the unified transaction model?
5. Which interest/day-count methods are supported exactly in v1?
6. Is lender-reported minimum manual-only first?
7. How are historical pre-yaccount payments represented?
8. Which strategy methods ship beyond avalanche, snowball, minimum, and custom?
9. Does Home show aggregate debt by default or only when explicitly added?
10. Which debt metadata syncs, exports, and appears in diagnostics?

## Source index

Primary/product sources:

- [YNAB: Loan Planner](https://www.ynab.com/blog/ynab-loan-planner)
- [YNAB: Debt Management](https://www.ynab.com/features/debt-management)
- [YNAB: Handling Interest in Loan Accounts](https://support.ynab.com/en_us/handling-interest-in-loan-accounts-a-guide-r1Y17LAkj)
- [YNAB: Getting Out of Debt](https://support.ynab.com/en_us/getting-out-of-debt-ByMlJW_C9)
- [Quicken: Debt Reduction Plan](https://info.quicken.com/win/how-do-i-create-a-debt-reduction-plan)
- [Undebt.it: Features and payoff methods](https://undebt.it/pricing-features-reviews.php)
- [Undebt.it: Custom payoff plans](https://undebt.it/blog/drag-drop-custom-payoff-plan/)
- [Tiller: Debt payoff templates](https://tiller.com/resources/personal-finance-spreadsheet-templates/debt-payoff-spreadsheet-templates/)
- [CFPB: Mortgage payment and amortization](https://www.consumerfinance.gov/ask-cfpb/how-does-paying-down-a-mortgage-work-en-1943/)
- [CFPB: Credit-card terms](https://www.consumerfinance.gov/consumer-tools/credit-cards/answers/key-terms/)
- [CFPB: Deferred-interest promotions](https://www.consumerfinance.gov/ask-cfpb/i-got-a-credit-card-promising-no-interest-for-a-purchase-if-i-pay-in-full-within-12-months-how-does-this-work-en-40/)
- [CFPB: Balance transfers and new-purchase interest](https://www.consumerfinance.gov/ask-cfpb/do-i-pay-interest-on-new-purchases-after-i-get-a-zero-or-low-rate-balance-transfer-en-49/)

Community demand samples:

- [Principal reduction versus interest and purchases](https://www.reddit.com/r/ynab/comments/1u07ucs/tracking_credit_card_principal/)
- [Tracking loans and cards; demand for stronger scenarios](https://www.reddit.com/r/ynab/comments/1reg6gi/debt_tracking/)
- [Aggregate debt progress on Home](https://www.reddit.com/r/ynab/comments/15giczr/ynab_separate_app_to_watch_debt_progress/)
- [Multiple APR balances and payoff visualization](https://www.reddit.com/r/ynab/comments/18no812/visualising_credit_card_payoff/)
- [Historical payoff progress](https://www.reddit.com/r/ynab/comments/1uvqpil/debt_payoff_tracker/)
- [Debt-management-plan split payments](https://www.reddit.com/r/ynab/comments/1vuqa3i/how_to_handle_debt_management_plan_reporting/)
