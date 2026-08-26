# Dashboard widget lab

Use `yaccount-dashboard-widget-lab-2026-08-26.json` to exercise every dashboard
widget with one deterministic account. Exact forecast figures assume the app's local
date is **2026-08-26**.

## Before importing

Import replaces all local yaccount data. If Google Drive is connected, it replaces that
copy too.

1. Open **Settings**.
2. Under **Your data**, select **Export** and keep that backup.
3. Disconnect Google Drive if this lab should stay local.
4. Select **Choose file** and pick
   `yaccount-dashboard-widget-lab-2026-08-26.json`.
5. Confirm the dialog says **212 changes**.
6. Type `replace`, then select **Replace everything**.
7. Wait for **Import complete**.
8. Open **Home**. Confirm four dashboards: **01 · Planning**, **02 · Forecast &
   Watch**, **03 · Analysis**, and **04 · Compact**.

Reimport the file whenever a test changes data or layout and you want a clean reset.

## Pass 1: 01 · Planning

Keep the reporting period at **Last 3 months**.

### Overall balance

1. Confirm the total is **$6,000.00**.
2. Confirm the 90-day line rises in several steps and does not show a fake zero/empty
   state.

### Money brief

1. Confirm **7 things need you**, but only the top three appear.
2. Confirm priority order: cash below zero Aug 27, 3 pending entries, Dining $30 over.
3. Select each row. Confirm it opens the relevant cash, Inbox, or category source.
4. Select **Review**. Confirm it opens the highest-priority source.
5. Confirm the note says four more matters exist.
6. Open **Show the math**. Verify inputs, exclusions, priority rule, and three-item cap.

Month-close work only appears during Aug 29–31 or Sep 1–5. In that window:

1. Return to Money brief and find **Close August**.
2. Confirm pending, over-budget, unmatched occurrence, and stale/missing investment
   checks appear.
3. Find the unmatched **Studio retainer** occurrence and the manual **Studio retainer
   deposit** candidate.
4. Confirm the candidate does **not** count as paid before selection.
5. Select **Use this entry**. Confirm the approved manual entry becomes the occurrence
   match and its pending duplicate is dismissed.
6. Select **Undo** in the toast. Confirm both changes reverse.
7. Repeat the match, then acknowledge August. Confirm the close section disappears.
8. Reload. Confirm the acknowledgement remains hidden because it is synced data.

### Budget triage

1. Confirm **4 need attention; 1 worth watching; 7 on track**.
2. Confirm Dining is red and **$30 over**.
3. Confirm Groceries shows **$20 left** but projects about **$120 over**.
4. Confirm Housing is fully spent and projects over; Education projects over from a
   zero-spend start.
5. Confirm Travel is in **Watch** and the seven healthy categories stay folded under
   **On track**.
6. Expand **On track**, then open category links.
7. Open **Show the math** and verify spent, budget, elapsed-month, and projection inputs.

### Commitments

1. In **Regular**, confirm grouped monthly load **$2,841.67**.
2. Confirm weekly groceries, twice-monthly cleaning, monthly rent/utilities/streaming,
   and medical items are grouped by category.
3. Confirm **Medical flex estimate** says **set later**.
4. Switch to **Irregular**. Confirm monthly equivalent **$675.00** and next item **Annual
   tuition, Aug 27 · $4,500.00**.
5. Confirm annual insurance and quarterly property tax are represented in the irregular
   view/month strip.
6. Reload. Confirm the selected Regular/Irregular mode persists.
7. Open **Show the math** and verify normalization over the next 12 months.

### Cash horizon

1. Confirm **60d** is selected.
2. Confirm projected low **-$1,125.00 on Aug 27** and the red zero-crossing warning.
3. Confirm Annual tuition causes the drop; Northstar Payroll on Aug 28 recovers it.
4. Confirm Brokerage auto-invest on Aug 29 is treated as a transfer and weekly
   groceries/rent continue the curve.
5. Confirm **Next income in 2 days** and **2 bills before then: -$4,525.00**.
6. Confirm two scheduled items are marked **set later** rather than silently valued at
   zero.
7. Switch 14d, 30d, and 60d; reload and confirm the selected horizon persists.
8. Open a scheduled row and **Show the math**.

### Allocation plan

1. In **Month**, confirm expected income **$6,200.00**: $3,700 received and $2,500
   scheduled.
2. Confirm expense budgets **-$5,500.00**, goal asks **-$1,590.00**, and plan exceeds
   income by **$890.00**.
3. Switch to **Pay cycle**. Confirm Northstar Payroll on Aug 28 is the anchor and
   **$1,572.42** remains unplanned.
4. Reload and confirm mode persistence.
5. Open **Show the math** and verify the income/planned/unplanned identity.

### Goal outlook

1. Confirm four goals are on track and one is passive.
2. Verify each planning mode:
   - Health reserve: deadline + reserve basis.
   - Japan 2027: deadline + spend-down contributions.
   - Emergency reserve: fixed monthly reserve plan.
   - Skills fund: fixed monthly plan without a target/deadline.
   - Laptop replacement: passive progress only.
3. Open a goal link and **Show the math**. Confirm progress, monthly ask, and projected
   finish statements match the goal mode.

### Recent entries

1. Confirm eight approved entries appear newest-first.
2. Confirm the approved stats-hidden reimbursement and approved manual retainer candidate
   appear; the three genuinely pending entries do not.
3. Confirm positive/refund amounts are green and expenses stay signed.
4. Open several rows and confirm Ledger focus.

## Pass 2: 02 · Forecast & Watch

### Money map

1. Confirm known tracked value **$26,187.00** and **1 unvalued container**.
2. Confirm overall balance reconciles Brokerage **$2,600.00** plus General
   **$3,400.00** to **$6,000.00**.
3. Confirm active goal containers total **$10,300.00**.
4. Confirm Retirement says **Unvalued**, not `$0.00`.
5. Confirm Household checking is negative and Long-term savings is positive under
   **Other**.
6. Confirm the note distinguishes transaction-derived cash from reported investment
   values.

### Month landing

1. Confirm likely kept and range both show **-$1,105.00**.
2. Confirm kept so far **-$2,640.00** and remaining scheduled net **+$1,535.00**.
3. Confirm the solid actual path, dotted forecast path, today marker, and Aug 31 endpoint.
4. Open **Show the math** and verify known scheduled items versus usual flexible spend.

### Container watch: General

1. Confirm current **$3,400.00**, scheduled low **-$1,125.00 on Aug 27**, floor
   **$1,000.00**, and distance **-$2,125.00**.
2. Expand **Change your floor**, edit it, and confirm the line/distance update.
3. Use **Change** to select another valid container, reload, and confirm subject
   persistence. Reimport afterward.
4. Open **Show the math**.

### Container watch: Emergency reserve

1. Confirm current/scheduled low **$6,700.00**, floor **$5,000.00**, and distance
   **$1,700.00**.
2. Confirm this instance remains independent from the General instance.

### Container watch: archived edge

1. Confirm the widget stays in place instead of disappearing.
2. Confirm copy says the watched container is archived/missing/not reportable.
3. Confirm **Choose another** can recover the instance.

### Category watch: Groceries

1. Confirm August spending **$680.00 of $700.00**.
2. Confirm six monthly bars, six-month median **$645.00**, recent seven-day spend
   **$180.00**, and likely month end about **$808.57**.
3. Confirm the refund remains signed in the calculation.
4. Use **Change** to select another expense category, reload, then reimport.
5. Open **Show the math**.

### Category watch: Dining

1. Confirm August spending **$330.00 of $300.00**.
2. Confirm six-month median **$320.00** and likely month end about **$437.14**.
3. Confirm this repeated instance is independent from Groceries.

## Pass 3: 03 · Analysis

Start with **Last 3 months** for period comparison, then use **Last 12 months** for
long-history widgets.

### What changed

1. At **Last 3 months**, confirm current and equal-length prior windows both contain data.
2. Confirm income, spending, kept, and largest drivers reconcile to the headline.
3. Confirm drivers name sources/categories and open filtered details.
4. Switch to **Last 12 months**. Confirm the widget updates.
5. Note whether the cross-year range label communicates years clearly; both endpoints
   currently render as `Aug 26`, which is intentionally easy to spot with this fixture.
6. Open **Show the math**.

### Money flow

1. At **Last 12 months**, confirm Salary and Freelance feed the center flow.
2. Confirm Housing, Saved, Groceries, Dining, Utilities, and smaller destinations branch
   on the right.
3. Confirm the diagram remains legible after narrowing the browser.

### Spending calendar

1. Confirm the latest eight-week day grid shows multiple intensities.
2. Select quiet and busy days; confirm Ledger opens with the correct date focus.
3. Confirm weekday labels and less→more legend remain readable at narrow width.

### Where it went

1. Confirm expense total **$29,711.00** and income total **$42,798.00**.
2. Confirm Housing leads expenses and Salary leads income.
3. Switch **Total** / **Monthly avg**; confirm labels, values, arcs, and mini-trends update.
4. Open category links from both expense and income groups.

### Top payees

1. Confirm Parkside Property leads at **$14,400.00 ×8**.
2. Confirm Market Square, City Utilities, Fresh Foods, Japan planning, and Corner Cafe
   follow in descending spend.
3. Open payee focus from the row/menu.

### Largest entries

1. Confirm the six $5,000 Northstar Payroll entries appear newest-first for the selected
   range.
2. Open a row and confirm Ledger focus.

### Income resilience

1. Use **Last 12 months**. Confirm **7 complete months** and typical month
   **$5,812.00**.
2. Confirm observed range **$5,013.00–$7,216.00**.
3. Confirm Northstar Payroll is **84% / steady**, Studio invoices **16% / variable**, and
   Savings interest is a small variable source.
4. Confirm scheduled fixed income **$6,200.00/mo** and month-to-month range
   **$2,203.00**.
5. Open **Show the math**.

### Month by month

1. Confirm the 12-month axis, seven populated months, and empty earlier months.
2. Confirm income, expenses, savings, and budget series are distinct.
3. Confirm August partial-month savings is negative.

### Income → expenses → savings

1. Confirm Income, Expenses, and Savings form the identity for the selected range.
2. Confirm signed direction/color and labels stay readable on mobile.

### Container flows

1. Confirm Brokerage **+$2,600**, Household checking **-$12,100**, Emergency reserve
   **+$200**, Retirement **+$1,000**, Long-term savings **+$8,000**, and Japan 2027
   **+$300**.
2. Confirm transfers are not mislabeled as income or spending.

### Investments

1. Confirm Brokerage value **$6,200.00**, contributed **$2,600.00**, gain/loss
   **+$3,600.00**.
2. Confirm snapshots dated Feb 1, May 1, and Aug 25 are represented on the timeline.
3. Scrutinize point placement against the 12-month x-axis; this fixture exposes any
   date-position error while totals remain correct.
4. Confirm Retirement remains visible as **No reported value yet**.

### Budget comparison

1. Confirm average/month, budget, and delta appear for all 12 expense budgets.
2. Confirm values sort from largest average spend downward.
3. Confirm zero-spend budgets show **-100%**, not missing or divide-by-zero output.
4. Confirm the mobile layout changes from table columns to readable stacked rows.

### Recent entries

Repeat the Planning Recent entries checks after changing periods. Confirm this fixed-view
widget does not imply that the selected period filters it.

## Pass 4: 04 · Compact

Use **Last 12 months**.

1. Scan every compact card: Money brief, Money map, Budget triage, What changed,
   Commitments, Cash horizon, Allocation plan, Goal outlook, Month landing, Income
   resilience, Container watch, Category watch, Recent entries.
2. Confirm each keeps its decision-driving headline and removes secondary detail.
3. Confirm controls still work: Regular/Irregular, horizon selector, Month/Pay cycle,
   subject Change, collapse, and Show the math.
4. Confirm compact What changed drivers reconcile; compact Money brief states four more
   items; compact Goal outlook states one passive goal.
5. At 390px, confirm no horizontal page scroll, clipped money values, colliding labels, or
   unreachable controls.

## Global interaction pass

1. On any dashboard, collapse several cards, reload, and confirm fold state persists per
   widget instance.
2. Open a non-fixed widget's overflow menu, override its period, and confirm the card
   labels its own range. Reload to confirm persistence.
3. Select **Compare**. Fixed widgets must stay in place and say **Period comparison isn't
   supported for this current view.** Period-aware widgets must render primary and
   compared cards side-by-side on desktop and stacked on mobile.
4. Open **Show the math** on every widget that offers it. Confirm the sheet names inputs,
   exclusions, and the rule used; close by button, Escape, and backdrop.
5. Select **Edit**. Resize expanded↔compact, reorder, hide, add, and duplicate repeatable
   watch widgets. Select **Done**, reload, and confirm the layout persists.
6. In the widget gallery, search `budget`, `income`, `watch`, `forecast`, and `investment`.
   Confirm grouping, setup status, repeatable watch creation, and subject selection.
7. Check light and dark themes.
8. Check desktop and a 390px mobile viewport. Watch especially:
   - Month landing's `Today` and `August 31` chart labels.
   - What changed's cross-year date label.
   - Investment snapshot positions.
   - The floating add button over chart legends, notes, amounts, or final rows.
9. Keyboard pass: Tab through dashboard tabs, period/compare/edit controls, collapsible
   headings, toggles, links, and sheets. Confirm visible focus and logical order.
10. Reimport the fixture, then compare the restored four dashboards and totals with the
    initial baseline.

## Fixture boundaries

- The dataset deliberately includes pending entries, a refund, a void pair, a stats-hidden
  category, an archived watch subject, a missing investment value, transfers, fixed and
  goal-derived recurring amounts, a cancelled rule, and multiple goal modes.
- Stats-hidden Reimbursable activity should affect its raw container balance but stay out
  of spending analytics.
- Exact future-facing output drifts after 2026-08-26 because dashboard forecasts use the
  device's real local date.
- Month-close UI cannot be driven manually on Aug 26; use Aug 29–Sep 5 or the automated
  clock-controlled test.
