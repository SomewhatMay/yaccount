# Plan: non-input-blocking chart animations

## Reported behavior

In installed iOS PWA mode, switching dashboards remains responsive while the Investments line draws, but can be ignored/delayed while the Where it went doughnut fills. Chrome does not reproduce the failure. Safari outside PWA is unverified.

## Code findings

- `src/features/reports/widgets.tsx` owns every animated Recharts data shape:
  - `CategoryDoughnut`: 1 `Pie`.
  - `MonthlyBarsChart`: 3 `Bar`, 1 `Line`.
  - `WaterfallChart`: 2 `Bar`.
  - `CategoryDrilldown`: 1 `Bar`, 1 `Line`.
  - `InvestmentCard`: 2 `Line`.
- All 11 shapes use `isAnimationActive="auto"`.
- `src/features/reports/DashboardView.tsx` wraps all dashboard widgets in Recharts `AnimationControllerProvider` using `interruptibleAnimationController`.
- `src/features/reports/chart-animation.ts` still drives each animation with repeated Recharts state updates. It wraps each listener call in React `startTransition`, but the interpolation, React scheduling, SVG reconciliation, and paint still repeat for every animation frame.
- Recharts 3.10 defaults amplify the pie case:
  - Pie: 400ms delay + 1500ms animation; every frame rebuilds every sector path.
  - Line: 0ms delay + 1500ms animation; one curve path per series.
  - Bar: 0ms delay + 400ms animation; one path per bar/data point.
- Therefore the reported pie is the clearest failure, all 6 bar series have the same frame-loop risk, and all 4 line series share the mechanism despite the observed Investments success.
- `MoneyFlowChart` in `src/features/reports/dashboard-widgets.tsx` uses `Sankey` without animation. `Sparkline` is custom static SVG. Neither enters the risky controller.
- `src/features/reports/chart-interactions.test.ts` currently proves controller presence, not absence of main-thread animation work.
- `e2e/dashboard-widget-lab.spec.ts` proves a dashboard click during pie geometry changes in Chromium only. It cannot emulate installed iOS WebKit scheduling.

## Implementation direction

Remove Recharts JavaScript animation from every data shape. Preserve graph-specific entrance motion with browser-native SVG/CSS animation:

- Doughnut: render final sector geometry immediately, reveal it clockwise through an SVG ring mask whose stroke offset is CSS-animated.
- Bars: render final rectangles immediately, apply a CSS scale animation from their zero axis. Positive and negative bars use the correct transform origin.
- Lines: render final paths immediately, apply a left-to-right CSS clip reveal. Preserve dashed budget styling.
- Keep axes, labels, legends, tooltips, hit regions, and final geometry available from first render.
- Honor the existing global `prefers-reduced-motion` kill switch.
- Remove `AnimationControllerProvider`, `chart-animation.ts`, and its controller test once no data shape consumes the frame loop.

This keeps animation in the browser rendering engine and removes per-frame JavaScript/React work. It also covers the bar charts identified by code inspection, not only the reported pie.

## TDD sequence

1. Change/add tests before implementation:
   - `chart-interactions.test.ts`: require all 11 shapes to disable Recharts animation.
   - Require pie, bar, and line native-animation hooks/classes.
   - Require no `AnimationControllerProvider` or interruptible controller.
   - Require radial, bar, and line keyframes plus reduced-motion coverage.
   - `dashboard-widget-lab.spec.ts`: detect an active CSS pie reveal, click another dashboard within the animation window, and assert the selection changes within the existing 750ms budget.
2. Run the focused Vitest test and Playwright test. Confirm failure because native hooks do not exist and Recharts animation remains enabled.
3. Add the smallest native animation helpers/styles and disable Recharts animations.
4. Remove the now-unused React controller and provider.
5. Run focused tests until green.

## Validation

- `npm test -- src/features/reports/chart-interactions.test.ts`
- `npx playwright test e2e/dashboard-widget-lab.spec.ts --project=mobile --grep "switches dashboards"`
- Full `npm test` after the fix.
- Full mobile/desktop Playwright at final integration.
- Build/type/lint to catch Recharts custom-shape typing and dead imports.
- Manual iPhone installed-PWA check remains required for the exact WebKit mode:
  1. Open Analysis so Where it went begins revealing.
  2. Immediately tap Compact/another dashboard repeatedly.
  3. Repeat during Month by month, Waterfall, Category drill-down, and Investments animation.
  4. Confirm first tap lands, animation remains visible, tooltip behavior remains intact.
  5. Repeat with Reduce Motion enabled.

## Acceptance criteria

- No Recharts data-shape animation controller runs on dashboard entry/update.
- Doughnut still fills clockwise; bars still rise; lines still reveal.
- Dashboard switch accepts the first click/tap during each animation.
- All 11 formerly animated shapes use the non-JavaScript path.
- Sankey/sparklines remain unchanged.
- Reduced Motion resolves effectively immediately.

## Risks and mitigations

- SVG mask URL IDs can collide: generate a React-stable unique ID per doughnut.
- Negative bars can grow from the wrong end: derive origin from the bar value and test both signs.
- CSS animation might restart unexpectedly on ordinary React updates: scope it to shape mount; verify period/dashboard changes visually.
- Chromium Playwright cannot certify installed iOS PWA behavior: retain a precise device checklist and make the architectural guarantee (zero per-frame JS) testable.

## Unresolved questions

None.
