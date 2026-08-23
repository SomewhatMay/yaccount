# Dashboard widget visual spec

Status: approved for implementation
Scope: approved widget concepts, dashboard recommendations 7-9, and the 10-15 decision record
Not in scope: debt, page rename/repositioning, or code

## Product ground

- Subject: a private, manual-first household money register.
- Audience: someone checking what needs attention, what is safe to plan, and where the month is heading.
- Dashboard job for this tranche: answer **What needs me now? What happens next?** without turning Home into a report catalog.
- Design direction: **The living register**. Existing paper, ink, iris, emerald, Fraunces, Geist, and Geist Mono remain unchanged. Each widget borrows the structure of a real financial instrument rather than sharing one generic card template.
- Signature: the **forecast stitch**. Actuals end at a visible `o` for today; projections continue with dots. It makes the boundary between fact and estimate impossible to miss.
- Deliberate restraint: no new colors, grades, scores, confetti, ornamental rules, or decorative charts.

## Existing visual language

No new palette or type roles are proposed.

| Role | Existing token or face | Use here |
|---|---|---|
| Paper | `--background`, `--card` | Page and laid-paper widgets |
| Ink | `--foreground` | Facts and exact values |
| Pencil | `--muted-foreground` | Forecasts, context, assumptions |
| Iris | `--brand` | Focus, today, selection; never general decoration |
| Emerald | `--positive` | Money in only |
| Warning | `--destructive` | Actual shortfall or missed obligation only |
| Display | Fraunces | One opening figure; restrained widget totals |
| UI | Geist | Labels, prose, controls |
| Data | Geist Mono | Every amount, percentage, count, and date-like datum |

ASCII notation used below:

```text
====  actual history       ....  forecast       o  today
[x]   complete             [ ]   open task      [!] needs attention
[---] range or capacity    [>]   opens detail   *  scheduled event
```

The ASCII borders represent existing soft card containers. Horizontal rules inside a widget appear only above totals.

## Consolidation decision

Seventeen approved concepts become eleven widgets plus one dashboard feature. Every approved idea remains present; repeated questions share one surface.

| Approved concept | Build surface | Decision |
|---|---|---|
| Monthly allocation | Allocation plan | Keep; compiles income, budgets, and goals into one honest plan. |
| Pay-cycle plan | Allocation plan: Pay cycle | Keep as a mode; same allocation question with the next-income boundary. |
| Money brief | Money brief | Keep; highest-value daily entry point. |
| Month close | Money brief: Close month | Combine; closing tasks belong in the brief only when timely. |
| Cash horizon | Cash horizon | Keep; dated cash forecast prevents avoidable low-balance surprises. |
| Until next income | Cash horizon | Combine; next income is a landmark on the same forecast. |
| Month landing | Month landing | Keep; turns the rest of the month into a transparent range, not a guess. |
| Budget triage | Budget triage | Keep; attention-first replacement for an exhaustive pace list. |
| Goal outlook | Goal outlook | Keep; adds trajectory and monthly asks to existing progress. |
| Money map | Money map | Keep; explains where tracked money lives and what job it serves. |
| What changed | What changed | Keep; explains deltas instead of repeating totals. |
| Recurring commitments | Commitments | Keep as Regular mode; exposes structural monthly load. |
| True-expense radar | Commitments: Irregular | Combine; known irregular costs are the other half of commitments. |
| Income resilience | Income resilience | Keep; shows concentration and observed variability without a score. |
| Container watch | Watch | Keep as a configurable instance type. |
| Category watch | Watch | Combine as another instance type; shared dossier, different math. |
| Multiple dashboards | Dashboard sets | Keep as a system feature; layouts and widget instances need a named home. |

Debt concepts move intact to `debt-system-research.md`. All other former Review items are dropped from this tranche. They do not get placeholder widgets.

## Existing widget merge plan

| Existing widget | Decision | One-line explanation |
|---|---|---|
| Overall balance | Keep pinned | It remains the page's only hero and spendable-balance statement. |
| Budget pace | Replace with Budget triage | Same source data, much better attention hierarchy. |
| Recent entries | Keep optional | Recent activity is useful and not duplicated by the planning widgets. |
| Saved this period | Absorb into What changed | “Kept” belongs beside its causes and prior-period delta. |
| Headline figures | Absorb into What changed | Totals without explanation no longer earn a separate strip. |
| Money flow | Keep optional analysis | It answers composition, not present action. |
| Spending calendar | Keep optional analysis | It shows past daily rhythm; Cash horizon shows the future. |
| Where it went | Keep optional analysis | Category composition remains a distinct historical question. |
| Top payees | Keep optional analysis | Payee concentration is not covered elsewhere. |
| Coming up | Replace with Cash horizon | Events become meaningful when placed against projected cash. |
| Largest entries | Keep optional analysis | Outlier inspection remains useful. |
| Goals | Replace with Goal outlook | Preserve progress while adding pace, date, and monthly ask. |
| Month by month | Keep optional analysis | Long-range history remains distinct from month landing. |
| Income -> expenses -> savings | Keep optional analysis | Period composition remains a drill-down report. |
| Category over time | Replace with Category watch | Configurable instances make the selected category durable and useful. |
| Container flows | Keep optional analysis | Transfer history is different from watching one balance. |
| Investments | Keep optional analysis | Performance is different from Money map's latest-value placement. |
| Budget comparison | Keep optional analysis | Multi-period allowances remain useful outside current-month triage. |

Stable stored widget IDs need an explicit migration when replacements ship; deletion-by-rename is not acceptable.

## Curated first dashboard

Only one dashboard exists for a new user. Additional dashboard sets are user-created from curated templates.

```text
+--------------------------------------------------------------------------+
| DASHBOARD                                      [Last 3 months v] [Edit]  |
| How the money moved                                                   |
|                                                                          |
| OVERALL BALANCE                                                         |
| $12,840.22                                                              |
| ===========================o                                            |
|                                                                          |
| +-------------------------------+  +----------------------------------+ |
| | MONEY BRIEF                   |  | BUDGET TRIAGE                    | |
| | 2 things need you             |  | 2 need attention; 9 on track    | |
| +-------------------------------+  +----------------------------------+ |
|                                                                          |
| +----------------------------------------------------------------------+ |
| | CASH HORIZON                                                        | |
| | $3.8k ====o....*........... low $1.2k ....*.... $2.9k               | |
| +----------------------------------------------------------------------+ |
|                                                                          |
| +-------------------------------+  +----------------------------------+ |
| | ALLOCATION PLAN               |  | GOAL OUTLOOK                    | |
| | $950 income remains unplanned |  | 2 on track; 1 needs $40/month   | |
| +-------------------------------+  +----------------------------------+ |
|                                                                          |
| [Conditional: Month landing after enough history]                       |
+--------------------------------------------------------------------------+
```

Default eligibility:

- Overall balance and Money brief: always.
- Budget triage: at least one active expense budget.
- Cash horizon: at least one active recurring rule; otherwise Recent entries takes its place.
- Allocation plan: a scheduled income rule plus at least one budget or active goal.
- Goal outlook: at least one active goal.
- Month landing: at least two complete months plus a scheduled item or stable spending history.
- No eligible widget leaves an empty card in the reading column. The gallery explains what data unlocks it.

Compact widgets pair on wide screens. Expanded widgets span the dashboard. Mobile always becomes one column. Users choose Compact or Expanded; they never drag arbitrary resize handles.

## Shared behavior contract

Every forecast widget must provide **Show the math** with:

- exact inputs and covered date range;
- actual, scheduled, and inferred amounts separated;
- data freshness;
- excluded containers or records;
- the rule used for any range or estimate.

Every widget must also have:

- a useful compact view, not a clipped expanded view;
- a directed empty state with the exact setup action;
- an insufficient-data state that does not fabricate certainty;
- ledger deep links only where the number maps to an honest transaction subset;
- keyboard focus, screen-reader summaries, reduced-motion support, and no chart-only meaning;
- no duplicate computation of a shared aggregate within the same dashboard render.

## 1. Money brief

**Brief:** a short, ranked list of cross-app matters that need attention today.
**Combines:** Money brief + Month close; also hosts data-health and scheduled-versus-happened checks.
**Character:** a morning note left on the register, not an alert center.

Expanded, during the close window:

```text
+--------------------------------------------------------------------------+
| MONEY BRIEF                                           Saturday, Aug 2    |
| 2 things need you                                            [Review >]  |
|                                                                          |
| [!] Groceries is $64 ahead of today's pace.             $85 left    [>] |
| [ ] 3 pending entries are ready to review.                           [>] |
|                                                                          |
| CLOSE JULY                                                2 of 3 done    |
| [x] Recurring income and bills accounted for                            |
| [x] No category ended above its allowance                               |
| [ ] Review the 3 pending entries                           [Review >]    |
|                                                                          |
| < Investment values are 31 days old; cash figures are current. >        |
+--------------------------------------------------------------------------+
```

Compact, ordinary day:

```text
+-----------------------------------+
| MONEY BRIEF          2 need you   |
| [!] Groceries: $85 left       [>] |
| [ ] 3 pending entries         [>] |
| Everything else is current.       |
+-----------------------------------+
```

All-clear state:

```text
+-----------------------------------+
| MONEY BRIEF                       |
| Nothing needs you right now.      |
| Next known bill: Power, Aug 28.   |
+-----------------------------------+
```

Rules:

- Rank missed or unsafe obligations first, then pending review, budget pace, stale snapshots, and month-close work.
- Cap at three items; **Review** opens the full source screen instead of growing a feed.
- Do not repeat ordinary upcoming bills already visible in Cash horizon.
- Show Close month only during the last three days of a month and first five days of the next month, until resolved or dismissed for that month.
- A close item is computed, not gamified. No streak, score, celebration, or scolding.

## 2. Allocation plan

**Brief:** shows how expected income is claimed by the current plan and what remains unplanned.
**Combines:** Monthly allocation + Pay-cycle plan.
**Character:** a sparse allocation register; dot leaders connect each job to its amount.

Month mode:

```text
+--------------------------------------------------------------------------+
| ALLOCATION PLAN                                      [Month] Pay cycle   |
| AUGUST EXPECTED INCOME                                        $5,800     |
| Received ....................................................  $4,350     |
| Still scheduled .............................................  $1,450     |
|                                                                          |
| CURRENT PLAN                                                             |
| Expense budgets ............................................  -$4,260     |
| Goal asks ...................................................    -$590     |
| ======================================================================   |
| UNPLANNED EXPECTED INCOME                                      $950     |
|                                                                          |
| < Includes the Aug 30 salary; excludes investment containers. > [Math]  |
+--------------------------------------------------------------------------+
```

Pay-cycle mode:

```text
+--------------------------------------------------------------------------+
| ALLOCATION PLAN                                       Month [Pay cycle]  |
| AUG 16 - AUG 29                                      next income: 6 days |
| Income for this cycle                                         $2,900     |
|                                                                          |
| NEEDED BEFORE AUG 30                                                    |
| Rent, second half ..........................................  -$1,200     |
| Scheduled bills ............................................    -$356     |
| Flexible budget share ......................................    -$430     |
| Goal asks ...................................................    -$250     |
| ======================================================================   |
| UNPLANNED FOR THIS CYCLE                                       $664     |
|                                                                          |
| < Flexible share is 6 days of the remaining monthly plan. >    [Math]   |
+--------------------------------------------------------------------------+
```

Compact:

```text
+-----------------------------------+
| ALLOCATION PLAN        [Month v]  |
| Expected income          $5,800   |
| Planned                 -$4,850   |
| ===============================   |
| Unplanned                  $950   |
| Salary due Aug 30.          [>]   |
+-----------------------------------+
```

Rules:

- This is an income plan, never “cash available” or “safe to spend.”
- Expected income follows the locked plan semantics: use the window's active recurring income occurrences when they cover it; otherwise use the user's manual income figure. Received versus still scheduled is a status split of that total, not a new forecasting method.
- Expense budgets use the effective target for the window; goal asks use the goal engine. Transfers are excluded except goal contributions.
- Pay-cycle mode ends immediately before the next scheduled positive occurrence. It disappears when no next income is known and explains how to add one.
- Flexible budget share is explicit pro-rating, not a claim that cash was assigned to an envelope.
- Negative unplanned income says **Plan exceeds income by $X**; it does not turn the whole card red.

## 3. Cash horizon

**Brief:** plots included cash after every known income, bill, and transfer over the next 14-60 days.
**Combines:** Cash horizon + Until next income + existing Coming up.
**Character:** a register timeline whose actual ink becomes a forecast pencil stitch at today.

Expanded:

```text
+--------------------------------------------------------------------------+
| CASH HORIZON                                      [14d] [30d] [60d]     |
| PROJECTED LOW                                      $1,240 on Sep 3       |
|                                                                          |
| $3.8k |====o....+2,900...............................................    |
|       |     ....*....                                                    |
| $2.4k |         .........-1,600                                          |
|       |                  *....-420                                       |
| $1.2k |                       *...x...........+2,900                      |
|       +-----|----------|----------|----------|----------|---------->     |
|           TODAY      AUG 30      SEP 3      SEP 10     SEP 15            |
|                                                                          |
| NEXT INCOME IN 6 DAYS                                                    |
| Aug 24  Power ...............................................   -$118 [>] |
| Aug 27  Internet ............................................    -$65 [>] |
| Aug 30  Salary .............................................. +$2,900 [>] |
|                                                                          |
| < Scheduled items only; ordinary card spending is not predicted. > [Math]|
+--------------------------------------------------------------------------+
```

Compact:

```text
+-----------------------------------+
| CASH HORIZON             30 days  |
| Low: $1,240 on Sep 3              |
| $3.8k ====o....*...x....* $2.9k   |
| Next income: Aug 30, +$2,900      |
| 2 bills before then: -$183    [>] |
+-----------------------------------+
```

Rules:

- Start from current balances of selected included, non-investment containers.
- Apply only active recurring occurrences and scheduled transfers; pending generated rows are de-duplicated against their source rule.
- Never call the space above the low point “safe to spend.” Unscheduled spending is explicitly absent.
- If the projection crosses below zero, show the first crossing and largest shortfall in warning tone. A user-set floor is handled by Container watch, not silently invented here.
- The next-income block is a landmark, not a second computation.
- Hover/focus an event to identify it; click to the recurring rule or generated entry.

## 4. Month landing

**Brief:** estimates what this month will keep after known commitments and observed flexible-spending behavior.
**Character:** a runway ending in a visible landing range; one point is never presented as destiny.

Expanded:

```text
+--------------------------------------------------------------------------+
| MONTH LANDING                                              August 2026   |
| LIKELY KEPT                                                   $1,050     |
| Expected range                                            $780 - $1,320  |
|                                                                          |
| $2.4k |=====================o                                            |
|       |                      ........                                    |
| $1.3k |                             .......[---------]                   |
| $1.0k |                                      ....X....                   |
| $0.8k |                                          [---------]             |
|       +----------|-----------|-----------|-----------|------------>      |
|                AUG 1       TODAY       AUG 27      AUG 31                |
|                                                                          |
| Kept so far ................................................ +$2,410      |
| Remaining scheduled net ....................................   -$710      |
| Usual flexible spending ....................................   -$650      |
| ======================================================================   |
| LIKELY KEPT                                                   $1,050     |
|                                                                          |
| < Flexible range uses the last 3 comparable months. >          [Math]   |
+--------------------------------------------------------------------------+
```

Compact:

```text
+-----------------------------------+
| MONTH LANDING          August 31  |
| Likely kept               $1,050  |
| Range               $780 - $1,320 |
| ========o.......[---X---]          |
| Known -$710; usual -$650     [>]  |
+-----------------------------------+
```

Rules:

- `Kept` means income minus categorized expenses, matching existing reporting semantics. Transfers never change it.
- Scheduled net and inferred flexible spending remain separate inputs in both UI and math detail.
- Comparable history excludes the partial current month and requires at least two complete months; three or more is preferred.
- The range comes from observed variability, not a cosmetic confidence percentage.
- With too little history, show **Early estimate: scheduled items only** and omit the range. With no scheduled future activity either, keep the widget in the gallery as locked-by-data.
- The selected dashboard period does not change this widget; it always describes the current calendar month.

## 5. Budget triage

**Brief:** shows only the budgets that need a decision now, while keeping on-track categories quiet.
**Replaces:** existing Budget pace.
**Character:** a triage slip ordered by recoverability, not a wall of progress bars.

Expanded:

```text
+--------------------------------------------------------------------------+
| BUDGET TRIAGE                                           August 23 of 31  |
| 2 need attention; 1 worth watching; 9 on track                         |
|                                                                          |
| NEEDS ATTENTION                                                          |
| Groceries                                                    $85 left [>] |
| [==========================------] 86% spent / 74% of month              |
| At the recent pace, about $81 over by month end.                         |
|                                                                          |
| Dining out                                                   $24 left [>] |
| [=============================---] 91% spent / 74% of month              |
| Last 7 days were $68 above the earlier weekly pace.                      |
|                                                                          |
| WATCH                                                                    |
| Fuel                                                        $112 left [>] |
| [======================----------] 69% spent / 74% of month              |
| One scheduled fill-up remains.                                          |
|                                                                          |
| ON TRACK                                                       9 [Show]  |
+--------------------------------------------------------------------------+
```

Compact:

```text
+-----------------------------------+
| BUDGET TRIAGE       Aug 23 of 31  |
| [!] Groceries: $85 left       [>] |
| [!] Dining out: $24 left      [>] |
| [ ] Fuel: one fill-up left    [>] |
| 9 on track.                  [Show]|
+-----------------------------------+
```

Rules:

- Sort actual overspend first, then projected overspend, then near-limit categories with a known remaining event.
- Compare percent of budget used with percent of month elapsed, but forecast from recent/comparable behavior only when enough data exists.
- A large planned purchase is not automatically a problem; scheduled matching expense is named as context.
- “On track” folds by default. The widget is for decisions, while Budget comparison remains the full audit table.
- If every category is on track, compact to **All 12 budgets are on track** plus the smallest remaining buffer.
- Category rows deep-link to the exact category and current month.

## 6. Goal outlook

**Brief:** shows whether active goals are likely to finish on time and what each asks this month.
**Replaces:** existing Goals.
**Character:** a set of quiet finish lines; the date matters as much as the percentage.

Expanded:

```text
+--------------------------------------------------------------------------+
| GOAL OUTLOOK                              3 goal plans total $590 this mo.|
|                                                                          |
| Portugal                                                   due May 2027  |
| $2,800  [=====================---------]  $4,000                    70%  |
| At $150/month: Apr 2027, about 1 month early.                  On track  |
|                                                                          |
| Emergency reserve                                         due Nov 2026  |
| $4,350  [==========================----]  $5,000                    87%  |
| Current plan lands at $4,880. Add $40/month to reach the target.     [>] |
|                                                                          |
| New laptop                                                no fixed date  |
| $920    [==================------------]  $1,500                    61%  |
| $260/month would finish around Nov 2026.                         [Edit]  |
|                                                                          |
| < Dates use approved transfers into each goal container. >      [Math]  |
+--------------------------------------------------------------------------+
```

Compact:

```text
+-----------------------------------+
| GOAL OUTLOOK        $590 in plans |
| Portugal       70%  1 month early |
| Reserve        87%  +$40/mo needed|
| Laptop         61%  Nov at $260/mo|
| 2 on track; 1 needs a change. [>] |
+-----------------------------------+
```

Rules:

- Preserve the existing goal basis, progress, and required-monthly math; do not infer deposits from ordinary spending.
- Deadline goals show projected completion versus deadline. Fixed goals show projected completion. Passive goals show progress without inventing an ask.
- Use approved goal-linked transfers only; pending contributions remain visibly pending.
- A missed pace is plain language, not a failed badge.
- Completed goals leave this widget and remain available in the Goals screen.
- The selected dashboard period does not change this widget.

## 7. Money map

**Brief:** reconciles the latest value of all tracked containers into plain job-based branches.
**Relationship to existing widgets:** extends the meaning of Overall balance without replacing its pinned hero; Investment performance remains separate.
**Character:** a register index tree—where the money sits, why it is there, and how fresh the value is.

Expanded:

```text
+--------------------------------------------------------------------------+
| MONEY MAP                                           as of Aug 23, 2026   |
| TRACKED VALUE                                                  $37,830   |
|                                                                          |
| All tracked value  $37,830                                               |
| |                                                                        |
| +-- Counted in overall balance ..............................  $12,840 [>]|
| |   +-- General .............................................   $2,084   |
| |   +-- Joint checking ......................................  $10,756   |
| |                                                                        |
| +-- Outside overall balance .................................  $24,990 [>]|
|     +-- Active goal containers ..............................   $6,900   |
|     |   +-- Emergency reserve ...............................   $4,350   |
|     |   +-- Portugal ........................................   $2,550   |
|     +-- Investments .........................................  $18,090   |
|     |   +-- Retirement ......................................  $11,520   |
|     |   +-- Brokerage .......................................   $6,570   |
|     +-- Other ...............................................       $0   |
| ======================================================================   |
| TRACKED VALUE                                                  $37,830   |
|                                                                          |
| < Brokerage value updated 2 days ago; retirement updated today. >       |
+--------------------------------------------------------------------------+
```

Compact:

```text
+-----------------------------------+
| MONEY MAP             Aug 23      |
| Tracked value          $37,830    |
| + Overall balance      $12,840    |
| + Goal containers       $6,900    |
| + Investments          $18,090    |
| + Other                     $0    |
| Values current within 2 days. [>] |
+-----------------------------------+
```

Rules:

- Say **Tracked value**, never net worth. Liabilities are intentionally absent until the debt system exists.
- The first split is exact: containers counted in Overall balance versus everything outside it. Outside containers then split by active goal, investment, and other, in that precedence order.
- Overall balance follows the existing opt-in container flag exactly. A counted goal or investment stays in that branch with a detail annotation; it is never counted again outside it.
- Investment and externally logged values show snapshot freshness; transaction-derived cash says current.
- The terminal double rule proves that branches reconcile to the opening total.
- A branch opens its containers; it is not a fake ledger link.

## 8. What changed

**Brief:** compares matched periods, then identifies the few categories or sources that caused the difference.
**Absorbs:** Saved this period + Headline figures.
**Character:** a variance ledger: result first, drivers indented beneath it.

Expanded:

```text
+--------------------------------------------------------------------------+
| WHAT CHANGED                                  Aug 1-23 vs Jul 1-23      |
| YOU KEPT $312 MORE                                                [Why] |
|                                                                          |
| Income                                                   $5,100   -$300  |
| Spending                                                 $3,852   -$612  |
| ======================================================================   |
| KEPT                                                     $1,248   +$312  |
|                                                                          |
| LARGEST DRIVERS                                                          |
| Less travel spending ............................................ +$450 [>]|
| Less dining out ................................................. +$182 [>]|
| Lower salary timing ............................................. -$300 [>]|
| More home spending .............................................. -$126 [>]|
| Everything else ................................................. +$106   |
| ======================================================================   |
| CHANGE IN KEPT                                                   +$312   |
|                                                                          |
| < The salary difference is timing: one deposit arrived Jul 22. > [Math] |
+--------------------------------------------------------------------------+
```

Compact:

```text
+-----------------------------------+
| WHAT CHANGED       vs prior period|
| Kept $312 more                  + |
| Travel                       +$450 |
| Salary timing                -$300 |
| Dining out                   +$182 |
| Other                         -$20 |
| Drivers reconcile to +$312.   [>] |
+-----------------------------------+
```

Rules:

- Compare equal-length, immediately preceding ranges using existing period semantics.
- Phrase expense reductions as positive contributions to kept money and increases as negative; the Math view still exposes signed ledger amounts.
- Rank drivers by absolute contribution, show at most four, and reconcile the remainder into **Everything else**.
- Detect likely timing only when the same normalized source occurs near the comparison boundary; label it as likely, never fact.
- Every category/source driver opens an honest filtered ledger subset.
- If no preceding range exists, explain which period choice enables comparison.

## 9. Commitments

**Brief:** separates the regular monthly load from known irregular costs over the coming year.
**Combines:** Recurring commitments + True-expense radar.
**Character:** recurring items read like a contract schedule; irregular items read like a dated reserve calendar.

Regular mode:

```text
+--------------------------------------------------------------------------+
| COMMITMENTS                                      [Regular] Irregular     |
| SCHEDULED MONTHLY LOAD                                       $2,184      |
|                                                                          |
| Housing                                                            $1,600|
| Aug 1   Rent ................................................   $1,600 [>]|
|                                                                          |
| Utilities                                                           $303|
| Aug 24  Power ...............................................     $118 [>]|
| Aug 27  Internet ............................................      $65 [>]|
| Sep 2   Mobile ..............................................     $120 [>]|
|                                                                          |
| Other                                                                $281|
| Streaming, gym, software, transit .........................      $281 [>]|
| ======================================================================   |
| SCHEDULED MONTHLY LOAD                                       $2,184      |
| < Active fixed expense rules normalized to one month. >        [Math]   |
+--------------------------------------------------------------------------+
```

Irregular mode:

```text
+--------------------------------------------------------------------------+
| COMMITMENTS                                       Regular [Irregular]    |
| KNOWN IN THE NEXT 12 MONTHS                                   $4,176     |
|                                                                          |
| Sep 03  Car insurance .........................................    $840  |
| Nov 20  Holidays ..............................................  $1,200  |
| Jan 15  Professional dues .....................................    $636  |
| Mar 01  Property tax ..........................................  $1,500  |
| ======================================================================   |
| MONTHLY EQUIVALENT                                              $348     |
|                                                                          |
|        AUG   SEP   OCT   NOV   DEC   JAN   FEB   MAR                  |
|         .   $840    .  $1.2k   .   $636    .  $1.5k                   |
|                                                                          |
| < Equivalent spreads known costs; it does not mean funds are reserved. >|
+--------------------------------------------------------------------------+
```

Compact:

```text
+-----------------------------------+
| COMMITMENTS          [Regular v]  |
| Monthly load            $2,184    |
| Next: Power, Aug 24       $118    |
| 9 active expense rules.      [>]  |
+-----------------------------------+
```

Rules:

- Regular mode normalizes active fixed expense rules into a monthly amount. Income rules never reduce this load.
- Irregular mode includes known expense occurrences with a cadence longer than monthly in the next 12 months.
- Monthly equivalent is arithmetic context, not funded status. The current model has no category envelope balance.
- Do not infer a recurring commitment from repeated transactions in v1. Repetition may suggest a setup action in Money brief only after a separate, reviewed detection design.
- Cash horizon owns near-term balance impact; Commitments owns structural burden and annual shape.
- Changing a rule opens the existing recurring-rule editor.

## 10. Income resilience

**Brief:** shows how variable and concentrated observed income has been, without pretending to judge financial health.
**Character:** a range band and source ledger; no grade, gauge, or opaque score.

Expanded:

```text
+--------------------------------------------------------------------------+
| INCOME RESILIENCE                                  last 6 complete months|
| TYPICAL MONTH                                                   $5,480   |
|                                                                          |
| Observed range       $4,620 [===============|================] $6,900    |
| Lower observed month           ^                 ^ typical               |
|                              $4,620             $5,480                    |
|                                                                          |
| SOURCES                                                                  |
| Northstar salary     [=========================-----] 78%      steady    |
| Studio work          [======------------------------] 18%      variable  |
| Other                [=-----------------------------]  4%      occasional|
|                                                                          |
| Scheduled fixed income ......................................  $4,700/mo |
| Largest-source share ........................................       78%  |
| Month-to-month range ........................................    $2,280  |
|                                                                          |
| < “Steady” means it appeared within 5% in all 6 months. >        [Math]  |
+--------------------------------------------------------------------------+
```

Compact:

```text
+-----------------------------------+
| INCOME RESILIENCE       6 months  |
| Typical month             $5,480  |
| Range              $4,620-$6,900  |
| Largest source                78%  |
| Fixed scheduled          $4,700/mo |
| No score; inspect sources.   [>]  |
+-----------------------------------+
```

Rules:

- Require six complete months for source classification; show a progress-to-eligibility message before that.
- Group sources by normalized `vendor_source`, with user correction available in detail.
- “Typical” is the median, not average; range is observed minimum to maximum.
- “Steady” is a disclosed consistency rule. It is descriptive, not guaranteed future income.
- Never recommend a minimum lifestyle, emergency amount, or job decision.
- The selected dashboard period can change the analysis window only among eligible complete-month presets.

## 11. Watch

**Brief:** a configurable, repeatable dossier for one container or category.
**Combines:** Container watch + Category watch; replaces Category over time for durable selections.
**Character:** pinning a page of the register open to the one number the user personally cares about.

Container instance, expanded:

```text
+--------------------------------------------------------------------------+
| WATCH: GENERAL                                Container   [Change] [...] |
| CURRENT BALANCE                                                  $2,084  |
|                                                                          |
| $2.8k |=========                                                        |
|       |         =====o....                                              |
| $2.0k |                  ....                                           |
| $1.6k |                      ...x....      scheduled low $1,612          |
| $1.5k |------------------------- floor --------------------------------  |
|       +----------|----------|----------|----------|--------------->      |
|                AUG 1      TODAY      AUG 30      SEP 3                  |
|                                                                          |
| 30-day net flow ...............................................   -$320  |
| Scheduled low ................................................  $1,612  |
| Distance above your floor ....................................    $112  |
| < Floor is your setting; forecast uses scheduled items only. >  [Math]  |
+--------------------------------------------------------------------------+
```

Category instance, expanded:

```text
+--------------------------------------------------------------------------+
| WATCH: GROCERIES                              Category    [Change] [...] |
| AUGUST SPENDING                                              $540 of $625|
| [===========================-----]  $85 left                           |
|                                                                          |
| LAST 6 MONTHS                                                            |
| Mar       Apr       May       Jun       Jul       Aug                     |
|  $510      $588      $642      $571      $670      $540                  |
|  [====]    [=====]   [======]  [=====]   [======]  [=====...]            |
|                                               budget -----------------   |
|                                                                          |
| Likely month end ...............................................   $706  |
| Six-month median ...............................................   $580  |
| Recent 7-day spend .............................................   $146  |
| < Likely value uses comparable weekly pace; $625 is the budget. > [Math]|
+--------------------------------------------------------------------------+
```

Compact instances:

```text
+-----------------------------------+  +-----------------------------------+
| WATCH: GENERAL          Container |  | WATCH: GROCERIES         Category |
| $2,084                            |  | $540 of $625                       |
| ========o....x  low $1,612        |  | [======================----]       |
| $112 above your floor.       [>]  |  | Likely $706; $85 left.       [>]  |
+-----------------------------------+  +-----------------------------------+
```

Rules:

- Dashboard layout v2 stores an instance ID, widget type, subject ID, compact/expanded mode, and widget-specific settings.
- Users may add multiple Watches; the gallery starts with likely subjects but never auto-adds dozens.
- Container floors are optional user settings. No default floor is inferred.
- Container forecast uses the subject container's scheduled entries and transfers, not overall cash.
- Category forecast uses categorized expenses only; refunds preserve their signed meaning.
- Archived or deleted subjects keep the instance with a clear **Choose another** state rather than silently changing it.

## 12. Dashboard sets

**Brief:** allows named dashboards with independent ordered widget instances.
**Type:** system feature, not a widget.
**Character:** labeled divider tabs in one register, not separate mini-apps.

Reading view:

```text
+--------------------------------------------------------------------------+
| DASHBOARD                                      [Last 3 months v] [Edit]  |
| How the money moved                                                   |
|                                                                          |
| [Overview]  [Planning]  [Trends]  [+]                                   |
|                                                                          |
| OVERALL BALANCE                                                         |
| $12,840.22                                                              |
| ===========================o                                            |
|                                                                          |
| ...Planning dashboard's ordered widgets...                              |
+--------------------------------------------------------------------------+
```

Add-dashboard sheet:

```text
+------------------------------------------+
| ADD DASHBOARD                            |
| Name  [Quarterly planning              ] |
|                                          |
| START WITH                               |
| (*) Planning                             |
|     Allocation, cash horizon, goals,     |
|     commitments                          |
| ( ) Trends                               |
|     What changed, month landing, income  |
| ( ) Current dashboard                    |
|     Duplicate widgets and settings       |
| ( ) Empty                                |
|                                          |
|                         [Cancel] [Create] |
+------------------------------------------+
```

Manage view:

```text
+--------------------------------------------------------------------------+
| YOUR DASHBOARDS                                                         |
| [::] Overview    6 widgets       Default                    [...]       |
| [::] Planning    5 widgets                                  [...]       |
| [::] Trends      7 widgets                                  [...]       |
|                                                                          |
| [...]  Rename | Duplicate | Make default | Delete                       |
+--------------------------------------------------------------------------+
```

Rules:

- New users receive one curated Overview only; template dashboards are offered, not pre-created.
- Each set owns order, hidden entries, instances, size modes, and per-widget preferences.
- Overall balance remains pinned first within every dashboard in this tranche.
- Rename and duplicate are reversible normal actions. Delete requires ordinary confirmation and always leaves at least one dashboard.
- Dashboard order and definitions sync. Which dashboard is currently open remains browser-local.
- Page repositioning or renaming to Home is recommendation 1 and explicitly deferred.

## Recommendation 7: preserve financial semantics

The recommendation means different facts must travel through different math. A single “money event” pipeline would produce confident-looking errors.

```text
                         SOURCE SEMANTICS

  approved transaction -------- actual money that happened --------+
  budget target ---------------- intended expense allowance --------+---> UI
  recurring occurrence --------- dated expected event --------------+
  goal + linked transfer -------- future purpose + real contribution +
  transfer ---------------------- location change, not income/spend -+
  investment snapshot ----------- value as of a stated date ---------+

                         ROUTING CONTRACT

  actuals ----------------------> What changed / Budget triage / Landing actual
  budgets ----------------------> Allocation / Budget triage / Category watch
  recurring --------------------> Cash horizon / Allocation / Commitments
  goals + contributions --------> Goal outlook / Allocation / Money map
  transfers --------------------> Cash/container forecasts; never “kept”
  snapshots --------------------> Money map / Investments with freshness

  NEVER:
  recurring event == happened transaction
  budget amount    == reserved cash
  transfer         == expense
  stale snapshot   == current value
```

Concrete split within a forecast:

```text
  fixed bill       -> exact dated step
  gradual budget   -> disclosed pace/range, never exact dated step
  goal ask         -> plan line until an approved contribution exists
  transfer         -> subtract source and add destination once
  variable income  -> observed range; scheduled amount only when a rule exists
```

## Recommendation 8: load only what matters

Current `content-visibility` saves off-screen paint/layout, but mounted widget functions can still compute. Layout v2 should make both code and derivation demand-driven.

```text
  open dashboard
       |
       v
  lightweight registry descriptors
       |
       +--> resolve dashboard set + eligible instances
       |
       v
  render shells and compact summaries
       |
       +--> shared selector cache keyed by data revision + date window
       |         |-- monthly actuals computed once
       |         |-- recurring occurrences computed once
       |         `-- balances computed once
       |
       +--> near viewport AND expanded?
                 | no  -> no chart module; no heavy widget derivation
                 ` yes -> lazy import -> derive detail -> render chart/list

  data changes -> invalidate affected selectors only -> visible consumers update
```

Performance budget to decide before implementation:

- Registry metadata must not import heavy chart implementations.
- Off-screen collapsed widgets must not run chart transforms.
- One occurrence expansion per range, shared by Cash horizon, Allocation, and Commitments.
- Measure initial JS, first useful render, aggregate compute time, and scroll responsiveness with a large fixture.
- Compact summaries may compute only their named values; expanding may request detail.

## Recommendation 9: make the gallery navigable

The existing flat hidden-widget list does not scale to instances or prerequisites.

```text
+------------------------------------------+
| ADD WIDGET                               |
| [Search widgets...                     ] |
|                                          |
| SUGGESTED FOR YOU                        |
| +--------------------------------------+ |
| | [mini] Goal outlook              [+] | |
| | 2 active goals; see pace and dates   | |
| +--------------------------------------+ |
|                                          |
| PLANNING                                 |
| Allocation plan | Cash horizon | Goals  |
|                                          |
| FORECASTS                                |
| Month landing | Income resilience       |
|                                          |
| WATCH ONE THING                          |
| [Container v] [General v]    [Add watch]|
|                                          |
| TRENDS AND ANALYSIS                      |
| What changed | Money flow | Payees ...  |
|                                          |
| NEEDS SETUP                              |
| Commitments - add a recurring item  [>] |
+------------------------------------------+
```

Rules:

- Groups describe the user's question: Planning, Forecasts, Watch one thing, Trends and analysis.
- Search covers title, plain-language description, and recognizable terms such as bill, paycheck, and category.
- Suggested uses current data eligibility, never financial-value profiling.
- Miniatures show structure, not random chart types.
- Ineligible widgets stay discoverable under Needs setup with one exact action.
- Instance widgets collect their subject before Add, avoiding a useless generic Watch card.

## Recommendation 10: deferred

Usefulness measurement is skipped for this tranche. No product analytics, local usage counters, telemetry, or measurement UI will be designed or implemented. The idea remains undecided for possible future review.

## Recommendations 11-15: numbering gap

The prior report available for this work defined dashboard recommendations 1-10 only. It did not contain recommendations 11-15, so inventing five designs would falsely attribute decisions to the report.

```text
  PRIOR REPORT NUMBERING

   1  Reposition dashboard as Home -------------- deferred by user
   2  Curate new-user defaults ------------------ accepted; shown above
   3  Conditional widgets ----------------------- accepted; shown above
   4  Layout v2 + instances --------------------- accepted; shown above
   5  Compact/expanded modes -------------------- accepted; shown above
   6  Explain forecasts ------------------------- accepted; shown above
   7  Preserve financial semantics ------------- diagrammed above
   8  Load only what matters ------------------- diagrammed above
   9  Navigable gallery ------------------------ diagrammed above
  10  Measure usefulness ----------------------- deferred; undecided
  11  [no source item]
  12  [no source item]
  13  [no source item]
  14  [no source item]
  15  [no source item]
  16  Debt work -------------------------------- deferred to debt brief
```

## Design self-critique

First-pass ideas that were removed or revised:

- Removed a universal health color and grade; it flattened unlike questions into opaque judgment.
- Removed donut charts from Allocation and Commitments; sparse register rows explain exact composition faster.
- Removed “safe to spend” from Cash horizon; the forecast cannot know unscheduled spending.
- Replaced single-number Month landing with a range and visible actual/forecast boundary.
- Prevented Money map from saying net worth; the model has no liabilities.
- Kept Spending calendar separate from Cash horizon because past rhythm and future solvency are different questions.
- Kept Investments separate from Money map because performance and placement are different questions.
- Made Month close conditional inside Money brief; a permanent checklist would become wallpaper.
- Made Watch explicitly user-instanced; auto-creating a card per category/container would be bloat.
- Limited the memorable visual risk to the forecast stitch. Everything else composes established register devices.

## Review gate before code

Implementation starts only after visual and consolidation approval. Behavior work will follow project TDD: failing core/component test, failure confirmation, minimum implementation, then `npm test`.

Questions:

- What were recommendations 11-15?
- Approve names and merges?
- Any mock to revise?
