# yaccount demo save

`yaccount-demo-save.json` is a portable 227-change account export, anchored to **October 11, 2026**. Settings → Your data also has a **Download demo save** link.

## Load it

1. On the device you want to demo, open **Settings → Your data**.
2. Keep an export of that device's account if you may need it later.
3. Choose `yaccount-demo-save.json` and confirm **Replace everything** by typing `replace`.
4. Open **Home**. The default dashboard is **01 · Overview**.

Import replaces the current account. If Google Drive is connected, it replaces the Drive copy too. Disconnect first when you want a local-only demo. Import the file again to return to its original state.

## Application map

The app stores a change journal locally in IndexedDB. It derives balances, budgets, plans, and reports from that journal. When connected, each device syncs its own journal through the user's Google Drive app-data area. Export/import carries the journal and synced dashboard settings; theme and reading preferences stay on the device.

The main links between features are:

- Transactions reference categories and containers. A transfer debits one container and credits another; voids remain visible as reversing rows.
- Budgets are category targets that can change by effective date. Goals track a container and can add automatic recurring contributions.
- Recurring rules generate pending transaction occurrences for Inbox. Approval makes an occurrence live; dismissal is reversible.
- Quick Add can reuse saved transaction templates. Cravings wins can optionally pair an avoided expense with a real transfer into a linked goal.
- Home widgets derive from the same ledger, goals, budgets, rules, snapshots, and craving wins. Their drill-downs lead back to the source page or ledger filter.

The shared shell changes by screen size: phones use Home/Ledger/Goals/More tabs, a topbar Inbox link, and a floating Quick Add button; desktop uses the destination rail. Global search and command actions use `⌘K`. The FAB opens expense entry on a short press and saved shortcuts on a hold.

## Demo route

- **01 · Overview** — balance, money brief, budget triage, recent entries, allocation, goals, month landing, craving savings.
- **02 · Planning** — budgets, income, goal asks, recurring commitments, cash horizon, recent entries.
- **03 · Forecasts & Watch** — money map, month landing, two category watches, and container watches for current, emergency, and archived states.
- **04 · Analysis** — money flow, spending calendar, category and payee breakdowns, largest entries, income resilience, monthly history, waterfall, container flows, investments, and budget comparisons.

## Page coverage

| Page | What the save gives you |
| --- | --- |
| Ledger | Income, expenses, refunds, transfers, notes, pending and approved entries, a void/reversal pair, searchable history, and three Quick Add shortcuts. |
| Inbox | Three pending entries, including a recurring occurrence and an unlinked item to review. |
| Plan | Expected scheduled income, time-based category budgets, goal asks, and unallocated money. |
| Goals | Active reserve and spend-down goals in deadline, fixed, and passive modes, plus completed, cancelled, and archived examples. |
| Cravings | Three wins: two move the same amount into linked goals, one is recorded without a transfer. |
| Recurring | Daily, weekly, twice-monthly, monthly, annual, and custom rules; income, expense, transfer, goal-derived, active, and paused examples. |
| Containers | Counted and uncounted wallets, investment and unvalued accounts, reported balance history, and an archived account. |
| Categories | Income and expense groups, supported icons, budget history, a stats-excluded category, and an archived category. |
| Settings | Import/export and restore-point flow, appearance, diagnostics, and sync controls. Authentication and live Drive sync need a connected account. |

The save contains the linked data these pages read. It also supports ledger filters and sort orders, chart drill-downs, recurring occurrence review, row editing and undo, goal maintenance, and category/container archive recovery.

Use dashboard tabs, the widget gallery, chart drill-downs, filters, and row actions to explore interactions. The same routes and save work on phone and desktop; navigation changes shape with the screen.

## Date and device notes

The checked-in sample dates are fixed to October 2026. Future schedules, rolling reports, and the month-close review use the device's real date, so their live figures change over time. The October month-close review appears October 29 through November 5. If importing an older copy, due recurring occurrences may backfill into Inbox. Before a later demo, refresh the sample with `DEMO_TODAY=YYYY-MM-DD node scripts/generate-demo-save.mjs` and rebuild the app.

Theme, sort order, report period, and active dashboard are device-local preferences; they are not part of an export. Google sign-in and Drive sync need a connected account and cannot be preloaded into a save.

The source fixture is `test-data/yaccount-dashboard-widget-lab-2026-08-26.json`. To rebuild the download after changing its curation, run `node scripts/generate-demo-save.mjs` and validate with `npm test`.
