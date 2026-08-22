import type { Category, CategoryType, BudgetTarget, Transaction } from "../model";
import { activeRows, sortRegister } from "./ledger";
import { budgetOnDate } from "./budgets";
import { inRange, monthKeysInRange, monthsInRange, type DateRange } from "./period";

/**
 * The §6 derived-view layer. Every aggregation here runs over `activeRows`
 * (`ledger.ts` — voided rows, their reversals, and templates already dropped) and
 * excludes transfers from category/income/expense math (a transfer has
 * `category_id === null`; no money left the user's possession, §5.4). Money stays
 * integer cents; monthly *averages* are the one place a fractional-then-rounded
 * cent is acceptable (a derived statistic, never stored). Callers pass a resolved
 * `DateRange` (§6.1) so the same functions serve any period or the compare ranges.
 */

export interface CategorySlice {
  categoryId: string;
  name: string;
  amount: number; // magnitude in cents
}

export interface MonthlyTotal {
  month: string; // "YYYY-MM"
  income: number; // cents
  expense: number; // cents, positive magnitude of outflow
  savings: number; // income − expense (may be negative)
}

/** Dashboard rows after synced category statistical exclusions. */
export function statsTransactions(
  txns: Transaction[],
  categories: Category[],
): Transaction[] {
  const excluded = new Set(
    categories.filter((category) => category.excluded_from_stats === true).map((c) => c.id),
  );
  return txns.filter(
    (transaction) =>
      transaction.category_id === null || !excluded.has(transaction.category_id),
  );
}

/** Category rows in the window, by type, that are real ledger entries. */
function categorized(
  txns: Transaction[],
  categories: Category[],
  range: DateRange,
): {
  rows: Transaction[];
  typeOf: Map<string, CategoryType>;
  nameOf: Map<string, string>;
} {
  const typeOf = new Map(categories.map((c) => [c.id, c.type]));
  const nameOf = new Map(categories.map((c) => [c.id, c.name]));
  const rows = activeRows(txns).filter(
    (t) => t.category_id !== null && inRange(t.date, range),
  );
  return { rows, typeOf, nameOf };
}

/** Net signed cents per category id (only the given type). */
function sumByCategory(
  rows: Transaction[],
  typeOf: Map<string, CategoryType>,
  type: CategoryType,
): Map<string, number> {
  const sums = new Map<string, number>();
  for (const t of rows) {
    const cid = t.category_id!;
    if (typeOf.get(cid) !== type) continue;
    sums.set(cid, (sums.get(cid) ?? 0) + t.amount);
  }
  return sums;
}

/**
 * Per-category spend/income for the window (§6.5 doughnuts). Signed sums net
 * refunds within a category, then the magnitude is charted. **Genuine
 * zero-filtering** (§6.4): a category that nets to $0 is dropped entirely.
 * Sorted largest-first.
 */
export function categoryBreakdown(
  txns: Transaction[],
  categories: Category[],
  range: DateRange,
  opts: { type: CategoryType },
): CategorySlice[] {
  const { rows, typeOf, nameOf } = categorized(txns, categories, range);
  const sums = sumByCategory(rows, typeOf, opts.type);
  const out: CategorySlice[] = [];
  for (const [cid, sum] of sums) {
    const amount = Math.abs(sum);
    if (amount === 0) continue;
    out.push({ categoryId: cid, name: nameOf.get(cid) ?? cid, amount });
  }
  return out.sort((a, b) => b.amount - a.amount);
}

/** The period-monthly-average variant of the breakdown (§6.5): each amount ÷ the
 * window's month count, rounded to the cent. */
export function categoryBreakdownMonthlyAverage(
  txns: Transaction[],
  categories: Category[],
  range: DateRange,
  opts: { type: CategoryType },
): CategorySlice[] {
  const rows = activeRows(txns).filter(
    (t) => t.category_id !== null && inRange(t.date, range),
  );
  const months = monthsInRange(
    range,
    rows.map((t) => t.date),
  );
  return categoryBreakdown(txns, categories, range, opts).map((s) => ({
    ...s,
    amount: Math.round(s.amount / months),
  }));
}

/**
 * Income / expense / savings per month across the window (§6.5 monthly bar).
 * Income = Σ over income-type categories; expense = the outflow magnitude
 * (−Σ over expense-type categories, so refunds reduce it); savings = income −
 * expense. Empty months in the window still appear (a zero bar). Transfers excluded.
 */
export function monthlyTotals(
  txns: Transaction[],
  categories: Category[],
  range: DateRange,
): MonthlyTotal[] {
  const { rows, typeOf } = categorized(txns, categories, range);
  const keys = monthKeysInRange(
    range,
    rows.map((t) => t.date),
  );
  const income = new Map<string, number>();
  const expenseSigned = new Map<string, number>();
  for (const t of rows) {
    const type = typeOf.get(t.category_id!);
    const bucket = t.date.slice(0, 7);
    if (type === "income") income.set(bucket, (income.get(bucket) ?? 0) + t.amount);
    else if (type === "expense")
      expenseSigned.set(bucket, (expenseSigned.get(bucket) ?? 0) + t.amount);
  }
  return keys.map((month) => {
    const inc = income.get(month) ?? 0;
    const rawExp = expenseSigned.get(month) ?? 0;
    const exp = rawExp === 0 ? 0 : -rawExp; // signed sum is negative → positive magnitude (normalize -0)
    return { month, income: inc, expense: exp, savings: inc - exp };
  });
}

/**
 * One category's spend per month against its **time-variant** budget (§6.5
 * drill-down): the budget is resolved at the first of each month (`budgetOnDate`,
 * §5.3), never the current value — a historical month shows the budget that was
 * in effect then.
 */
export function categoryMonthlySpend(
  txns: Transaction[],
  categoryId: string,
  range: DateRange,
  budgetTargets: BudgetTarget[],
): { month: string; spend: number; budget: number | null }[] {
  const rows = activeRows(txns).filter(
    (t) => t.category_id === categoryId && inRange(t.date, range),
  );
  const keys = monthKeysInRange(
    range,
    rows.map((t) => t.date),
  );
  const signed = new Map<string, number>();
  for (const t of rows)
    signed.set(t.date.slice(0, 7), (signed.get(t.date.slice(0, 7)) ?? 0) + t.amount);
  return keys.map((month) => ({
    month,
    spend: Math.abs(signed.get(month) ?? 0),
    budget: budgetOnDate(budgetTargets, categoryId, `${month}-01`),
  }));
}

/**
 * The total expense-budget allowance in effect on a date (§6.5 monthly-bar
 * overlay): the sum of every expense category's time-variant budget resolved at
 * that date (`budgetOnDate`, §5.3), a null budget counting as 0. Drives the
 * budget reference line on the monthly income/expense/savings chart.
 */
export function totalExpenseBudgetOnDate(
  budgetTargets: BudgetTarget[],
  categories: Category[],
  date: string,
): number {
  let sum = 0;
  for (const c of categories) {
    if (c.type !== "expense") continue;
    sum += budgetOnDate(budgetTargets, c.id, date) ?? 0;
  }
  return sum;
}

/** Collapse a monthly series into the Income → Expenses → Savings waterfall
 * totals (§6.5). The chart draws these three as a stacked bar with a transparent
 * base (impl §10 #28) — no second chart library. */
export function waterfallData(totals: MonthlyTotal[]): {
  income: number;
  expenses: number;
  savings: number;
} {
  const income = totals.reduce((s, m) => s + m.income, 0);
  const expenses = totals.reduce((s, m) => s + m.expense, 0);
  return { income, expenses, savings: income - expenses };
}

export interface BudgetComparisonRow {
  categoryId: string;
  name: string;
  actualMonthlyAvg: number; // cents, rounded
  budget: number | null; // cents, the target in effect over the window
  deltaPct: number | null; // (actual − budget) / budget * 100
}

/**
 * Actual monthly-average spend vs. budget, per expense category, **re-scoped to
 * the active period** (§6.3) — deliberately not the spreadsheet's all-time
 * average. The budget in effect is resolved at the window's end (`budgetOnDate`);
 * for an unbounded window it uses the latest logged date. Categories with neither
 * a budget nor any spend are omitted.
 */
export function budgetComparison(
  txns: Transaction[],
  categories: Category[],
  range: DateRange,
  budgetTargets: BudgetTarget[],
): BudgetComparisonRow[] {
  const { rows, typeOf, nameOf } = categorized(txns, categories, range);
  const months = monthsInRange(
    range,
    rows.map((t) => t.date),
  );
  const spendSigned = sumByCategory(rows, typeOf, "expense");
  const asOf =
    range.end ??
    (rows.length ? rows.reduce((m, t) => (t.date > m ? t.date : m), rows[0].date) : null);

  const ids = new Set<string>(spendSigned.keys());
  for (const bt of budgetTargets) {
    if (typeOf.get(bt.category_id) === "expense") ids.add(bt.category_id);
  }

  const out: BudgetComparisonRow[] = [];
  for (const cid of ids) {
    const actualMonthlyAvg = Math.round(Math.abs(spendSigned.get(cid) ?? 0) / months);
    const budget = asOf ? budgetOnDate(budgetTargets, cid, asOf) : null;
    if (actualMonthlyAvg === 0 && budget === null) continue;
    const deltaPct =
      budget && budget !== 0 ? ((actualMonthlyAvg - budget) / budget) * 100 : null;
    out.push({
      categoryId: cid,
      name: nameOf.get(cid) ?? cid,
      actualMonthlyAvg,
      budget,
      deltaPct,
    });
  }
  return out.sort((a, b) => b.actualMonthlyAvg - a.actualMonthlyAvg);
}

// ── The dashboard-v2 derivations (M11) ───────────────────────────────────────

export interface PeriodSummary {
  income: number; // cents in
  expense: number; // cents out, positive magnitude
  saved: number; // income − expense (negative when the window overspent)
  /** Share of income kept, as a fraction. Null when nothing came in — there is
   *  no share of zero, and reporting 0% would read as "you saved nothing". */
  savingsRate: number | null;
}

/**
 * The four numbers a period is judged by (§6.5, M11). One pass over the window's
 * category rows: transfers never appear (own money moving is neither in nor out)
 * and voided pairs are already gone via `activeRows`.
 */
export function periodSummary(
  txns: Transaction[],
  categories: Category[],
  range: DateRange,
): PeriodSummary {
  const { rows, typeOf } = categorized(txns, categories, range);
  let income = 0;
  let expenseSigned = 0;
  for (const t of rows) {
    const type = typeOf.get(t.category_id!);
    if (type === "income") income += t.amount;
    else if (type === "expense") expenseSigned += t.amount;
  }
  const expense = expenseSigned === 0 ? 0 : -expenseSigned; // normalize -0
  const saved = income - expense;
  return { income, expense, saved, savingsRate: income === 0 ? null : saved / income };
}

export interface SummaryDelta {
  incomePct: number | null;
  expensePct: number | null;
  savedPct: number | null;
  /** A rate moves in percentage POINTS, never in percent: 25% → 40% is +15
   *  points, and calling that "+60%" is the classic way to mis-state a ratio. */
  ratePoints: number | null;
}

/** Percent change against the SIZE of the earlier figure, so a deficit that
 *  halved reads as a gain rather than as −50%. Null where there is no base to
 *  divide by — a change from nothing is not a percentage. */
function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/** How this window moved against the equivalent one before it (M11). */
export function comparePeriodSummary(
  current: PeriodSummary,
  previous: PeriodSummary,
): SummaryDelta {
  return {
    incomePct: pctChange(current.income, previous.income),
    expensePct: pctChange(current.expense, previous.expense),
    savedPct: pctChange(current.saved, previous.saved),
    ratePoints:
      current.savingsRate === null || previous.savingsRate === null
        ? null
        : (current.savingsRate - previous.savingsRate) * 100,
  };
}

export interface DailySpend {
  date: string;
  /** Net outflow that day. Negative on a day where refunds outweighed spending
   *  — the calendar shows that as "no spend", but the engine does not hide it. */
  amount: number;
}

/**
 * Outflow per calendar day (M11) — the spending calendar's heat. Sparse and
 * ascending: a day that nets to zero is omitted (§6.4's zero-filtering), so the
 * caller reads it as a lookup over whatever day axis it draws (`trailingDays`).
 */
export function dailySpend(
  txns: Transaction[],
  categories: Category[],
  range: DateRange,
): DailySpend[] {
  const { rows, typeOf } = categorized(txns, categories, range);
  const signed = new Map<string, number>();
  for (const t of rows) {
    if (typeOf.get(t.category_id!) !== "expense") continue;
    signed.set(t.date, (signed.get(t.date) ?? 0) + t.amount);
  }
  return [...signed.entries()]
    .filter(([, sum]) => sum !== 0)
    .map(([date, sum]) => ({ date, amount: -sum }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export interface PayeeTotal {
  payee: string;
  amount: number; // cents spent, positive magnitude
  count: number;
}

/**
 * Where the money actually went, by name (M11). Spending only — a payee list
 * with your employer at the top answers nothing.
 *
 * One payee spelled two ways is one payee: names are free text, so grouping is
 * case-insensitive over the trimmed, NFC-normalised name (the same normalisation
 * `nameTaken` uses for categories). The spelling shown is the one carrying the
 * most money, ties by the alphabetically first — a display choice, but a
 * deterministic one, so two devices show the same list (§8.5).
 */
export function topPayees(
  txns: Transaction[],
  categories: Category[],
  range: DateRange,
  limit = 5,
): PayeeTotal[] {
  const { rows, typeOf } = categorized(txns, categories, range);
  const groups = new Map<
    string,
    { total: number; count: number; spellings: Map<string, number> }
  >();
  for (const t of rows) {
    if (typeOf.get(t.category_id!) !== "expense") continue;
    const name = t.vendor_source.trim().normalize("NFC");
    if (name === "") continue;
    const key = name.toLocaleLowerCase();
    const g = groups.get(key) ?? { total: 0, count: 0, spellings: new Map() };
    g.total += -t.amount; // signed outflow → positive magnitude
    g.count += 1;
    g.spellings.set(name, (g.spellings.get(name) ?? 0) + -t.amount);
    groups.set(key, g);
  }

  const out: PayeeTotal[] = [];
  for (const g of groups.values()) {
    if (g.total <= 0) continue; // a net refund is not somewhere money went
    let payee = "";
    let best = -Infinity;
    for (const [spelling, amount] of g.spellings) {
      if (amount > best || (amount === best && spelling < payee)) {
        payee = spelling;
        best = amount;
      }
    }
    out.push({ payee, amount: g.total, count: g.count });
  }
  return out
    .sort((a, b) => b.amount - a.amount || (a.payee < b.payee ? -1 : 1))
    .slice(0, limit);
}

/**
 * The biggest entries in the window (M11), by the SIZE of the amount — a $2,140
 * paycheck belongs on this list as much as a $1,850 rent payment. Transfers are
 * excluded: moving your own money is not an event this list is about. Ranking and
 * tie-breaks are `sortRegister`'s, so this list and the register agree.
 */
export function largestTransactions(
  txns: Transaction[],
  range: DateRange,
  limit = 5,
): Transaction[] {
  const rows = activeRows(txns).filter(
    (t) => t.category_id !== null && inRange(t.date, range),
  );
  return sortRegister(rows, "largest").slice(0, limit);
}

/** The share of income kept, month by month (M11) — null in a month with no
 *  income, because a rate needs something to be a rate OF. */
export function savingsRateSeries(
  totals: MonthlyTotal[],
): { month: string; rate: number | null }[] {
  return totals.map((m) => ({
    month: m.month,
    rate: m.income === 0 ? null : m.savings / m.income,
  }));
}

export interface CategoryTrend extends CategorySlice {
  /** One magnitude per month key of the window, ascending — the shape of the
   *  category over the period, drawn beside its total. */
  series: number[];
}

/**
 * The breakdown, plus each row's month-by-month shape (M11). Same order, same
 * zero-filtering as `categoryBreakdown` — this is that list with a sparkline
 * attached, never a second ranking that could disagree with it.
 */
export function categoryTrendSeries(
  txns: Transaction[],
  categories: Category[],
  range: DateRange,
  opts: { type: CategoryType },
): CategoryTrend[] {
  const { rows, typeOf } = categorized(txns, categories, range);
  const keys = monthKeysInRange(
    range,
    rows.map((t) => t.date),
  );
  const index = new Map(keys.map((k, i) => [k, i]));
  const signed = new Map<string, number[]>();
  for (const t of rows) {
    const cid = t.category_id!;
    if (typeOf.get(cid) !== opts.type) continue;
    const i = index.get(t.date.slice(0, 7));
    if (i === undefined) continue;
    const series = signed.get(cid) ?? new Array<number>(keys.length).fill(0);
    series[i] += t.amount;
    signed.set(cid, series);
  }
  return categoryBreakdown(txns, categories, range, opts).map((slice) => ({
    ...slice,
    series: (signed.get(slice.categoryId) ?? new Array<number>(keys.length).fill(0)).map(
      Math.abs,
    ),
  }));
}

export type SankeyNodeKind = "income" | "drawdown" | "hub" | "expense" | "saved";

export interface SankeyFlows {
  nodes: {
    /** The category this strand is, when it is one — so the diagram can wear the
     *  same swatch the doughnut and the register do (§12.2). Null for the hub,
     *  for "Saved", and for a folded-up "Other". */
    id: string | null;
    name: string;
    kind: SankeyNodeKind;
  }[];
  /** Indices into `nodes` — the shape recharts' `Sankey` takes verbatim. */
  links: { source: number; target: number; value: number }[];
}

/** A slice's own id, or null where the strand is not one category. */
function sliceId(slice: CategorySlice): string | null {
  return slice.categoryId === OTHER_ID ? null : slice.categoryId;
}

/**
 * Income → one hub → expenses and what was kept (M11).
 *
 * The hub is what makes it readable: without it every income category would fan
 * to every expense category, implying a link between the two that no ledger row
 * supports. One trunk says the true thing — money pools, then leaves.
 *
 * When a window spends more than it earned, the shortfall enters the hub as a
 * `drawdown` strand rather than leaving the diagram unbalanced: money spent
 * beyond income came from somewhere, and saying so is the honest picture.
 */
export function sankeyFlows(
  txns: Transaction[],
  categories: Category[],
  range: DateRange,
  opts: { limit?: number } = {},
): SankeyFlows {
  const limit = opts.limit ?? 6;
  const incomes = capped(
    categoryBreakdown(txns, categories, range, { type: "income" }),
    limit,
  );
  const expenses = capped(
    categoryBreakdown(txns, categories, range, { type: "expense" }),
    limit,
  );
  const totalIn = incomes.reduce((s, x) => s + x.amount, 0);
  const totalOut = expenses.reduce((s, x) => s + x.amount, 0);
  if (totalIn === 0 && totalOut === 0) return { nodes: [], links: [] };

  const nodes: SankeyFlows["nodes"] = [];
  const links: SankeyFlows["links"] = [];
  for (const s of incomes) nodes.push({ id: sliceId(s), name: s.name, kind: "income" });
  const shortfall = Math.max(0, totalOut - totalIn);
  if (shortfall > 0) nodes.push({ id: null, name: "Savings", kind: "drawdown" });

  const hub = nodes.length;
  nodes.push({ id: null, name: "All income", kind: "hub" });
  for (let i = 0; i < hub; i++) {
    links.push({
      source: i,
      target: hub,
      value: i < incomes.length ? incomes[i].amount : shortfall,
    });
  }

  for (const s of expenses) {
    links.push({ source: hub, target: nodes.length, value: s.amount });
    nodes.push({ id: sliceId(s), name: s.name, kind: "expense" });
  }
  const saved = totalIn - totalOut;
  if (saved > 0) {
    links.push({ source: hub, target: nodes.length, value: saved });
    nodes.push({ id: null, name: "Saved", kind: "saved" });
  }
  return { nodes, links };
}

/**
 * Cap a side of the diagram at `limit` STRANDS — the biggest `limit − 1` by
 * name, and everything behind them gathered into one "Other". A diagram with
 * twenty hairs off it carries less than one with seven, and the cap has to
 * include Other or it isn't a cap.
 */
function capped(slices: CategorySlice[], limit: number): CategorySlice[] {
  if (slices.length <= limit) return slices;
  const head = slices.slice(0, limit - 1);
  const rest = slices.slice(limit - 1).reduce((s, x) => s + x.amount, 0);
  return rest > 0
    ? [...head, { categoryId: OTHER_ID, name: "Other", amount: rest }]
    : head;
}

/** The gathered tail is not a category, so it carries a reserved id rather than
 *  a real one — nothing may look it up and find a category that isn't there. */
const OTHER_ID = "__other";
