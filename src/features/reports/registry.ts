import {
  lazy,
  type ComponentType,
  type LazyExoticComponent,
  type ReactNode,
} from "react";
import { activeRows, inRange, precedingRange, type DateRange } from "@/core/engine";
import type {
  BudgetTarget,
  Category,
  Container,
  ContainerSnapshot,
  Goal,
  RecurringRule,
  Setting,
  Transaction,
} from "@/core/model";
import { formatCents } from "@/core/money";
import type { DashboardAggregates } from "./dashboard-aggregates";

export interface WidgetContext {
  range: DateRange;
  today: string;
  categories: Category[];
  containers: Container[];
  ledgerTransactions: Transaction[];
  reportTransactions: Transaction[];
  budgetTargets: BudgetTarget[];
  snapshots: ContainerSnapshot[];
  recurringRules: RecurringRule[];
  goals: Goal[];
  aggregates: DashboardAggregates;
  instanceSettings?: Record<string, unknown>;
  saveInstanceSettings?: (settings: Record<string, unknown>) => Promise<void>;
  syncedSettings?: Setting[];
}

export type WidgetAvailability =
  | { status: "ready" }
  | {
      status: "needs-setup" | "insufficient-data" | "empty";
      title: string;
      description: string;
      action: { label: string; href: string };
    };

export interface WidgetMathLine {
  kind: "actual" | "scheduled" | "inferred" | "context";
  label: string;
  amount?: number;
  value?: string;
  note?: string;
}

export interface WidgetMathDisclosure {
  range: string;
  freshness: string;
  lines: WidgetMathLine[];
  exclusions: string[];
  rule: string;
}

export type WidgetRenderer = ComponentType<WidgetContext>;
export type WidgetModuleLoader = () => Promise<{ default: WidgetRenderer }>;
export type WidgetGalleryGroup = "planning" | "forecasts" | "watch" | "analysis";

export interface WidgetGalleryMetadata {
  group: WidgetGalleryGroup;
  terms: string[];
  repeatable?: boolean;
  subject?: "container" | "category";
  suggest?: (ctx: WidgetContext) => string | null;
}

export interface WidgetDef {
  id: string;
  title: string;
  description: string;
  defaultVisible: boolean;
  bare?: boolean;
  fixedWindow?: boolean;
  gallery?: WidgetGalleryMetadata;
  /** Production descriptors use loaders; render functions remain a small test seam. */
  load?: WidgetModuleLoader;
  loadCompact?: WidgetModuleLoader;
  component?: LazyExoticComponent<WidgetRenderer>;
  compactComponent?: LazyExoticComponent<WidgetRenderer>;
  render?: (ctx: WidgetContext) => ReactNode;
  renderCompact?: (ctx: WidgetContext) => ReactNode;
  availability?: (ctx: WidgetContext) => WidgetAvailability;
  math?: (ctx: WidgetContext) => WidgetMathDisclosure;
}

const rangeFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});
const monthLabelFmt = new Intl.DateTimeFormat("en-US", { month: "long" });

export function rangeText(range: DateRange): string {
  if (range.start === null && range.end === null) return "All time";
  const format = (iso: string) => rangeFmt.format(new Date(`${iso}T00:00:00`));
  return `${range.start ? format(range.start) : "…"} – ${range.end ? format(range.end) : "…"}`;
}

export function paceTitle(today: string): string {
  return `Budget pace — ${monthLabelFmt.format(new Date(`${today.slice(0, 7)}-01T00:00:00`))}`;
}

type LegacyWidgetId =
  | "balance"
  | "pace"
  | "recent"
  | "saved"
  | "kpis"
  | "flow"
  | "calendar"
  | "breakdown"
  | "payees"
  | "upcoming"
  | "largest"
  | "goals"
  | "monthly"
  | "waterfall"
  | "trend"
  | "flows"
  | "investments"
  | "budgets";

function loadLegacy(id: LegacyWidgetId): WidgetModuleLoader {
  return () =>
    import("./legacy-widget-renderers").then((module) => ({
      default: module.LEGACY_WIDGET_RENDERERS[id],
    }));
}

function legacy(id: LegacyWidgetId) {
  const load = loadLegacy(id);
  return { load, component: lazy(load) };
}

const loadRecentCompact: WidgetModuleLoader = () =>
  import("./legacy-widget-renderers").then((module) => ({
    default: module.LEGACY_COMPACT_RENDERERS.recent,
  }));

const loadMoneyMap: WidgetModuleLoader = () =>
  import("./widget-modules/MoneyMapWidget").then((module) => ({
    default: module.MoneyMapExpanded,
  }));
const loadMoneyMapCompact: WidgetModuleLoader = () =>
  import("./widget-modules/MoneyMapWidget").then((module) => ({
    default: module.MoneyMapCompact,
  }));

const loadWhatChanged: WidgetModuleLoader = () =>
  import("./widget-modules/WhatChangedWidget").then((module) => ({
    default: module.WhatChangedExpanded,
  }));
const loadWhatChangedCompact: WidgetModuleLoader = () =>
  import("./widget-modules/WhatChangedWidget").then((module) => ({
    default: module.WhatChangedCompact,
  }));

const loadBudgetTriage: WidgetModuleLoader = () =>
  import("./widget-modules/BudgetTriageWidget").then((module) => ({
    default: module.BudgetTriageExpanded,
  }));
const loadBudgetTriageCompact: WidgetModuleLoader = () =>
  import("./widget-modules/BudgetTriageWidget").then((module) => ({
    default: module.BudgetTriageCompact,
  }));

const loadGoalOutlook: WidgetModuleLoader = () =>
  import("./widget-modules/GoalOutlookWidget").then((module) => ({
    default: module.GoalOutlookExpanded,
  }));
const loadGoalOutlookCompact: WidgetModuleLoader = () =>
  import("./widget-modules/GoalOutlookWidget").then((module) => ({
    default: module.GoalOutlookCompact,
  }));

const loadCashHorizon: WidgetModuleLoader = () =>
  import("./widget-modules/CashHorizonWidget").then((module) => ({
    default: module.CashHorizonExpanded,
  }));
const loadCashHorizonCompact: WidgetModuleLoader = () =>
  import("./widget-modules/CashHorizonWidget").then((module) => ({
    default: module.CashHorizonCompact,
  }));

const loadAllocationPlan: WidgetModuleLoader = () =>
  import("./widget-modules/AllocationPlanWidget").then((module) => ({
    default: module.AllocationPlanExpanded,
  }));
const loadAllocationPlanCompact: WidgetModuleLoader = () =>
  import("./widget-modules/AllocationPlanWidget").then((module) => ({
    default: module.AllocationPlanCompact,
  }));
const loadMonthLanding: WidgetModuleLoader = () =>
  import("./widget-modules/MonthLandingWidget").then((module) => ({
    default: module.MonthLandingExpanded,
  }));
const loadMonthLandingCompact: WidgetModuleLoader = () =>
  import("./widget-modules/MonthLandingWidget").then((module) => ({
    default: module.MonthLandingCompact,
  }));

function compact(loader: WidgetModuleLoader) {
  return { loadCompact: loader, compactComponent: lazy(loader) };
}

function gallery(
  group: WidgetGalleryGroup,
  terms: string[],
  suggest?: WidgetGalleryMetadata["suggest"],
): WidgetGalleryMetadata {
  return { group, terms, ...(suggest ? { suggest } : {}) };
}

function whatChangedMath(context: WidgetContext): WidgetMathDisclosure {
  const result = context.aggregates.whatChanged(context.range);
  if (!result) {
    return {
      range: rangeText(context.range),
      freshness: "Approved ledger entries in the selected period.",
      lines: [],
      exclusions: [
        "Transfers",
        "pending and template entries",
        "stats-hidden categories",
      ],
      rule: "Choose a bounded period to create an immediately preceding equal-day comparison.",
    };
  }
  return {
    range: `${rangeText(result.currentRange)} compared with ${rangeText(result.previousRange)}`,
    freshness: `Approved ledger entries through ${result.currentRange.end}.`,
    lines: [
      { kind: "actual", label: "Current income", amount: result.current.income },
      {
        kind: "actual",
        label: "Current spending (signed ledger)",
        amount: -result.current.expense,
      },
      { kind: "actual", label: "Current kept", amount: result.current.kept },
      { kind: "context", label: "Prior income", amount: result.previous.income },
      {
        kind: "context",
        label: "Prior spending (signed ledger)",
        amount: -result.previous.expense,
      },
      { kind: "context", label: "Prior kept", amount: result.previous.kept },
      ...result.allDrivers.map((driver) => ({
        kind: "context" as const,
        label: `${driver.kind === "income" ? "Income source" : "Expense category"}: ${driver.label}`,
        amount: driver.contribution,
        note: driver.likelyTiming
          ? "Likely timing only: this source appears near a comparison edge."
          : undefined,
      })),
    ],
    exclusions: ["Transfers", "pending and template entries", "stats-hidden categories"],
    rule: "Current kept minus prior kept. Expense reductions contribute positively; increases contribute negatively. The four largest absolute drivers are shown and Everything else closes the exact difference.",
  };
}

function whatChangedAvailability(context: WidgetContext): WidgetAvailability {
  const previous = precedingRange(context.range);
  if (!previous) return { status: "ready" };
  const hasComparisonActivity = activeRows(context.reportTransactions).some(
    (transaction) =>
      transaction.category_id !== null &&
      (inRange(transaction.date, context.range) || inRange(transaction.date, previous)),
  );
  return hasComparisonActivity
    ? { status: "ready" }
    : {
        status: "empty",
        title: "Build a comparison history",
        description: "Approved entries in either matched period unlock this variance.",
        action: { label: "Open the ledger", href: "/ledger" },
      };
}

function budgetTriageAvailability(context: WidgetContext): WidgetAvailability {
  return context.aggregates.budgetTriage(context.today).rows.length > 0
    ? { status: "ready" }
    : {
        status: "needs-setup",
        title: "Set an expense budget",
        description: "A current category allowance unlocks budget triage.",
        action: { label: "Set a budget", href: "/categories" },
      };
}

function budgetTriageMath(context: WidgetContext): WidgetMathDisclosure {
  const triage = context.aggregates.budgetTriage(context.today);
  return {
    range: `${rangeText({ start: triage.start, end: triage.end })} · as of ${context.today}`,
    freshness:
      "Approved actuals through today; linked pending and future rows remain scheduled.",
    lines: triage.rows.flatMap((row) => [
      {
        kind: "actual" as const,
        label: `${row.name}: approved spend`,
        amount: -row.spent,
      },
      ...(row.scheduled.length > 0
        ? [
            {
              kind: "scheduled" as const,
              label: `${row.name}: known remaining`,
              amount: -row.scheduledRemaining,
              note: row.scheduled
                .map((item) => `${item.label} on ${item.date}`)
                .join("; "),
            },
          ]
        : []),
      ...(row.linearProjection === null
        ? []
        : [
            {
              kind: "inferred" as const,
              label: `${row.name}: linear month projection`,
              amount: -row.linearProjection,
              note: `${row.elapsedDays} of ${row.daysInMonth} calendar days elapsed.`,
            },
          ]),
      {
        kind: "context" as const,
        label: `${row.name}: effective budget`,
        amount: row.budget,
      },
      {
        kind: "context" as const,
        label: `${row.name}: governing projection`,
        amount: -row.projected,
      },
    ]),
    exclusions: [
      "Transfers",
      "stats-hidden categories",
      "pending rows from actual spend",
      "linear pace during the first six days",
    ],
    rule: "Spent over budget ranks first. Otherwise the greater of linear day pace and spent plus known scheduled expense governs; over budget needs attention, at least 90% is Watch, and the rest is On track.",
  };
}

function goalOutlookAvailability(context: WidgetContext): WidgetAvailability {
  return context.aggregates.goalOutlook(context.today).rows.length > 0
    ? { status: "ready" }
    : {
        status: "needs-setup",
        title: "Create an active goal",
        description: "A goal plan unlocks finish lines and monthly asks.",
        action: { label: "Set up a goal", href: "/goals" },
      };
}

function goalOutlookMath(context: WidgetContext): WidgetMathDisclosure {
  const outlook = context.aggregates.goalOutlook(context.today);
  return {
    range: `As of ${context.today}`,
    freshness: "Approved goal activity and current reserve balances.",
    lines: outlook.rows.flatMap((row) => [
      {
        kind: "actual" as const,
        label: `${row.name}: ${row.kind === "reserve" ? "reserve balance" : "approved contributions"}`,
        amount: row.basis,
      },
      ...(row.target === null
        ? []
        : [
            {
              kind: "context" as const,
              label: `${row.name}: target`,
              amount: row.target,
            },
          ]),
      ...(row.monthlyAsk === 0
        ? []
        : [
            {
              kind: "scheduled" as const,
              label: `${row.name}: monthly ask`,
              amount: row.monthlyAsk,
            },
          ]),
      ...(row.deadline === null
        ? []
        : [
            {
              kind: "context" as const,
              label: `${row.name}: deadline`,
              value: row.deadline,
            },
          ]),
      ...(row.projectedCompletion === null
        ? []
        : [
            {
              kind: "inferred" as const,
              label: `${row.name}: projected completion`,
              value: row.projectedCompletion,
            },
          ]),
    ]),
    exclusions: [
      "Pending transfers",
      "ordinary spending from contribution progress",
      "completed, cancelled, and archived goals",
    ],
    rule: "Reserve goals use the live container balance. Spend-down goals use approved contributions. Deadline goals show the required monthly ask; fixed goals project from their planned monthly amount; passive goals infer neither.",
  };
}

function cashHorizonDays(context: WidgetContext): 14 | 30 | 60 {
  const value = context.instanceSettings?.horizonDays;
  return value === 14 || value === 30 || value === 60 ? value : 30;
}

function cashHorizonAvailability(context: WidgetContext): WidgetAvailability {
  const horizon = context.aggregates.cashHorizon(context.today, cashHorizonDays(context));
  const hasActiveRule = context.recurringRules.some(
    (rule) => rule.status !== "cancelled",
  );
  return hasActiveRule || horizon.events.length > 0 || horizon.unknownEvents.length > 0
    ? { status: "ready" }
    : {
        status: "needs-setup",
        title: "Schedule an income or bill",
        description: "An active recurring item unlocks the cash forecast.",
        action: { label: "Add a recurring item", href: "/recurring" },
      };
}

function cashHorizonMath(context: WidgetContext): WidgetMathDisclosure {
  const horizon = context.aggregates.cashHorizon(context.today, cashHorizonDays(context));
  return {
    range: `${rangeText({ start: horizon.start, end: horizon.end })} · ${horizon.days} days`,
    freshness: `Approved cash through ${horizon.start}; dated known events through ${horizon.end}.`,
    lines: [
      {
        kind: "actual",
        label: "Included cash as of today",
        amount: horizon.startingBalance,
      },
      ...horizon.events.map((event) => ({
        kind: "scheduled" as const,
        label: `${event.date}: ${event.label}`,
        amount: event.amount,
        note:
          event.source === "approved-future"
            ? "Future-dated approved row"
            : event.source === "pending"
              ? "Pending generated row"
              : "Active recurring occurrence",
      })),
      {
        kind: "context",
        label: `Projected low on ${horizon.low.date}`,
        amount: horizon.low.balance,
      },
      {
        kind: "context",
        label: `Projected balance on ${horizon.end}`,
        amount: horizon.projectedBalance,
      },
    ],
    exclusions: [
      "Investment, archived, and overall-balance-excluded containers",
      "templates and cancelled rules",
      "ordinary unscheduled spending",
      "unlinked pending income and expenses",
      ...(horizon.unknownEvents.length > 0
        ? [`${horizon.unknownEvents.length} recurring amount set later`]
        : []),
    ],
    rule: "Start with raw approved cash as of today. Apply each future approved row, linked pending row, scheduled transfer, and active fixed recurring occurrence once on its date. Transfers inside included cash net to zero. No flexible spending or cash floor is inferred.",
  };
}

function allocationManualIncome(context: WidgetContext): number {
  const key = `expected_income:${context.today.slice(0, 7)}`;
  const value = Number(
    context.syncedSettings?.find((setting) => setting.key === key)?.value ?? 0,
  );
  return Number.isSafeInteger(value) ? value : 0;
}

function allocationAnchorIds(context: WidgetContext): string[] | undefined {
  const value = context.instanceSettings?.payCycleAnchorRuleIds;
  return Array.isArray(value) && value.every((id) => typeof id === "string")
    ? value
    : undefined;
}

function allocationAvailability(context: WidgetContext): WidgetAvailability {
  const plan = context.aggregates.allocationMonth(
    context.today,
    allocationManualIncome(context),
  );
  if (!plan.incomeFromRules && plan.expectedIncome === 0) {
    return {
      status: "needs-setup",
      title: "Schedule expected income",
      description: "A recurring income rule unlocks the allocation plan.",
      action: { label: "Add recurring income", href: "/recurring" },
    };
  }
  if (plan.planned === 0) {
    return {
      status: "needs-setup",
      title: "Give expected income a job",
      description: "An expense budget or active goal creates the plan.",
      action: { label: "Set a budget", href: "/categories" },
    };
  }
  return { status: "ready" };
}

function allocationMath(context: WidgetContext): WidgetMathDisclosure {
  const requestedPayCycle = context.instanceSettings?.allocationMode === "pay-cycle";
  const payCycle = requestedPayCycle
    ? context.aggregates.allocationPayCycle(context.today, allocationAnchorIds(context))
    : null;
  if (payCycle) {
    return {
      range: `${rangeText({ start: payCycle.start, end: payCycle.end })} · next income ${payCycle.nextIncome.date}`,
      freshness: `Current plan and active recurring rules as of ${context.today}.`,
      lines: [
        {
          kind: "scheduled",
          label: "Income for this cycle",
          amount: payCycle.income,
        },
        ...payCycle.scheduledExpenses.map((expense) => ({
          kind: "scheduled" as const,
          label: `${expense.date}: ${expense.label}`,
          amount: -expense.amount,
        })),
        {
          kind: "inferred",
          label: "Flexible budget share",
          amount: -payCycle.flexibleBudgetShare,
          note: `${formatCents(payCycle.allowanceShare)} of allowances pro-rated over the covered calendar days, less exact scheduled expenses.`,
        },
        {
          kind: "context",
          label: "Pro-rated goal asks",
          amount: -payCycle.goalAskShare,
        },
        {
          kind: "context",
          label: "Unplanned for this cycle",
          amount: payCycle.unplanned,
        },
      ],
      exclusions: [
        "Transfers except their effect on existing goal progress",
        "archived categories and inactive goals",
        "ordinary unscheduled spending",
      ],
      rule: "Selected recurring income rules define the cycle boundaries; every active income occurrence inside the cycle counts. Exact scheduled expenses claim their dates first, flexible allowances and current goal asks are pro-rated by calendar day, and the next-income day is excluded.",
    };
  }

  const month = context.aggregates.allocationMonth(
    context.today,
    allocationManualIncome(context),
  );
  return {
    range: `${currentMonthText(context.today)} · as of ${context.today}`,
    freshness: "Approved received income and the current synced plan.",
    lines: [
      {
        kind: "actual",
        label: "Received income",
        amount: month.received,
      },
      {
        kind: "scheduled",
        label: "Still scheduled",
        amount: month.stillScheduled,
      },
      {
        kind: "context",
        label: "Expense budgets",
        amount: -month.totalAllowances,
      },
      {
        kind: "context",
        label: "Goal asks",
        amount: -month.totalGoalAsks,
      },
      {
        kind: "context",
        label: "Unplanned expected income",
        amount: month.unplanned,
      },
    ],
    exclusions: [
      "Transfers except their effect on existing goal progress",
      "archived categories and inactive goals",
      "cash-balance and safe-to-spend claims",
    ],
    rule: "Reuse the monthly plan exactly: recurring income for the month wins when it covers the window, otherwise the synced manual figure applies; subtract effective expense budgets and current goal asks once.",
  };
}

function currentMonthText(today: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(`${today.slice(0, 7)}-01T00:00:00`));
}

function monthLandingAvailability(context: WidgetContext): WidgetAvailability {
  const landing = context.aggregates.monthLanding(context.today);
  const hasSchedule =
    landing.scheduledItems.length > 0 || landing.unknownItems.length > 0;
  const hasFlexibleHistory =
    landing.history.length >= 2 &&
    landing.history.some((item) => item.flexibleSpending !== 0);
  if (!hasSchedule && !hasFlexibleHistory) {
    return {
      status: "insufficient-data",
      title: "Build a landing signal",
      description:
        "Two complete months of flexible spending or a remaining scheduled item unlocks this forecast.",
      action: { label: "Review activity", href: "/ledger" },
    };
  }
  return { status: "ready" };
}

function monthLandingRange(today: string): string {
  const yearMonth = today.slice(0, 7);
  const [year, month] = yearMonth.split("-").map(Number);
  const endDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthName = new Intl.DateTimeFormat("en-US", { month: "long" }).format(
    new Date(`${yearMonth}-01T00:00:00`),
  );
  return `${monthName} 1–${endDay}, ${year} · actual through ${monthName} ${Number(today.slice(8))}`;
}

function monthLandingMath(context: WidgetContext): WidgetMathDisclosure {
  const landing = context.aggregates.monthLanding(context.today);
  return {
    range: monthLandingRange(context.today),
    freshness: `Approved actuals through ${context.today}; known activity through ${landing.end}.`,
    lines: [
      {
        kind: "actual",
        label: "Income through today",
        amount: landing.actualIncome,
      },
      {
        kind: "actual",
        label: "Categorized expenses through today",
        amount: -landing.actualExpense,
      },
      { kind: "actual", label: "Kept so far", amount: landing.keptSoFar },
      ...landing.scheduledItems.map((item) => ({
        kind: "scheduled" as const,
        label: `${item.date}: ${item.label}`,
        amount: item.amount,
        note:
          item.source === "pending"
            ? "Pending; expected, not actual."
            : item.source === "approved-future"
              ? "Approved future row; enters on its date."
              : "Active recurring occurrence.",
      })),
      ...landing.unknownItems.map((item) => ({
        kind: "scheduled" as const,
        label: `${item.date}: ${item.label}`,
        value: "set later",
      })),
      {
        kind: "scheduled",
        label: "Remaining scheduled net",
        amount: landing.remainingScheduledNet,
      },
      ...landing.history.map((item) => ({
        kind: "inferred" as const,
        label: `${item.month}: aligned flexible spending`,
        amount: -item.flexibleSpending,
        note: `${item.start} through ${item.end}; recurring-linked rows excluded.`,
      })),
      ...(landing.usualFlexibleSpending === null
        ? []
        : [
            {
              kind: "inferred" as const,
              label: "Usual flexible spending",
              amount: -landing.usualFlexibleSpending,
            },
          ]),
      { kind: "context", label: "Likely kept", amount: landing.likelyKept },
    ],
    exclusions: [
      "transfers",
      "stats-hidden categories",
      "recurring-linked spending from the flexible-history sample",
      "the partial current month from comparable history",
    ],
    rule: "Actual kept is approved stats-visible income less categorized expense through today. Add de-duplicated future approved, pending, and recurring net once; then subtract the median flexible expense from the aligned remaining slices of the last two or three complete months. The observed minimum and maximum form the range.",
  };
}

/** Lightweight descriptors only. Render code enters through dynamic imports. */
export const DASHBOARD_WIDGETS: WidgetDef[] = [
  {
    id: "balance",
    title: "Overall balance",
    description: "Current total across every counted container.",
    defaultVisible: true,
    bare: true,
    fixedWindow: true,
    ...legacy("balance"),
  },
  {
    id: "money-map",
    title: "Money map",
    description: "Where tracked value sits and which job each container has.",
    defaultVisible: false,
    fixedWindow: true,
    gallery: gallery(
      "analysis",
      ["container", "account", "investment", "goal", "net worth", "value"],
      ({ containers }) => {
        const count = containers.filter((container) => !container.is_archived).length;
        return count > 1
          ? `${count} tracked locations; reconcile where value sits`
          : null;
      },
    ),
    availability: ({ containers }) =>
      containers.some((container) => !container.is_archived)
        ? { status: "ready" }
        : {
            status: "needs-setup",
            title: "Add a container",
            description: "A tracked location unlocks this map.",
            action: { label: "Set up containers", href: "/containers" },
          },
    load: loadMoneyMap,
    component: lazy(loadMoneyMap),
    ...compact(loadMoneyMapCompact),
  },
  {
    id: "pace",
    title: "Budget triage",
    description: "Which current allowances need a decision and which stay quiet.",
    defaultVisible: true,
    fixedWindow: true,
    gallery: gallery(
      "planning",
      ["budget", "allowance", "overspending", "pace", "watch", "on track"],
      (context) => {
        const count = context.aggregates.budgetTriage(context.today).rows.length;
        return count > 0 ? `${count} active allowances ready for triage` : null;
      },
    ),
    load: loadBudgetTriage,
    component: lazy(loadBudgetTriage),
    ...compact(loadBudgetTriageCompact),
    availability: budgetTriageAvailability,
    math: budgetTriageMath,
  },
  {
    id: "recent",
    title: "Recent entries",
    description: "The latest approved entries across the ledger.",
    defaultVisible: true,
    fixedWindow: true,
    gallery: gallery("analysis", ["transaction", "entry", "activity", "ledger"]),
    ...legacy("recent"),
    ...compact(loadRecentCompact),
  },
  {
    id: "saved",
    title: "What changed",
    description: "Why kept money moved versus the equal-length prior period.",
    defaultVisible: true,
    gallery: gallery(
      "analysis",
      ["income", "expense", "savings", "kept", "comparison", "drivers", "variance"],
      ({ reportTransactions }) =>
        reportTransactions.length > 0
          ? "See which categories and sources moved kept money"
          : null,
    ),
    load: loadWhatChanged,
    component: lazy(loadWhatChanged),
    ...compact(loadWhatChangedCompact),
    availability: whatChangedAvailability,
    math: whatChangedMath,
  },
  {
    id: "kpis",
    title: "Headline figures",
    description: "Income, spending, savings rate, and ending balance at a glance.",
    defaultVisible: true,
    bare: true,
    gallery: gallery("analysis", ["summary", "income", "spending", "balance"]),
    ...legacy("kpis"),
  },
  {
    id: "flow",
    title: "Money flow",
    description: "How income moved through categories and into savings.",
    defaultVisible: true,
    gallery: gallery("analysis", ["income", "expense", "savings", "sankey"]),
    ...legacy("flow"),
  },
  {
    id: "calendar",
    title: "Spending calendar",
    description: "Daily spending rhythm across the latest eight weeks.",
    defaultVisible: true,
    gallery: gallery("analysis", ["daily", "spending", "heatmap", "calendar"]),
    ...legacy("calendar"),
  },
  {
    id: "breakdown",
    title: "Where it went",
    description: "Income and expenses by category, with recent trends.",
    defaultVisible: true,
    gallery: gallery("analysis", ["category", "breakdown", "doughnut"]),
    ...legacy("breakdown"),
  },
  {
    id: "payees",
    title: "Top payees",
    description: "The largest destinations for spending in the selected period.",
    defaultVisible: true,
    gallery: gallery("analysis", ["merchant", "vendor", "payee", "spending"]),
    ...legacy("payees"),
  },
  {
    id: "upcoming",
    title: "Cash horizon",
    description: "How known income, bills, and transfers change included cash.",
    defaultVisible: true,
    fixedWindow: true,
    gallery: gallery(
      "planning",
      ["bill", "subscription", "recurring", "paycheck", "scheduled"],
      ({ recurringRules }) =>
        recurringRules.some((rule) => rule.status !== "cancelled")
          ? "Scheduled money is ready to review"
          : null,
    ),
    load: loadCashHorizon,
    component: lazy(loadCashHorizon),
    ...compact(loadCashHorizonCompact),
    availability: cashHorizonAvailability,
    math: cashHorizonMath,
  },
  {
    id: "allocation",
    title: "Allocation plan",
    description: "How expected income is claimed by budgets and goal asks.",
    defaultVisible: true,
    fixedWindow: true,
    gallery: gallery(
      "planning",
      ["income", "allocation", "plan", "budget", "goal", "pay cycle"],
      (context) => {
        const plan = context.aggregates.allocationMonth(
          context.today,
          allocationManualIncome(context),
        );
        return plan.expectedIncome !== 0 && plan.planned !== 0
          ? `${formatCents(plan.expectedIncome)} expected; see what remains unplanned`
          : null;
      },
    ),
    load: loadAllocationPlan,
    component: lazy(loadAllocationPlan),
    ...compact(loadAllocationPlanCompact),
    availability: allocationAvailability,
    math: allocationMath,
  },
  {
    id: "largest",
    title: "Largest entries",
    description: "The highest-value entries in the selected period.",
    defaultVisible: true,
    gallery: gallery("analysis", ["transaction", "purchase", "largest"]),
    ...legacy("largest"),
  },
  {
    id: "goals",
    title: "Goal outlook",
    description: "Finish lines, monthly asks, and progress for active goals.",
    defaultVisible: true,
    fixedWindow: true,
    gallery: gallery(
      "planning",
      ["goal", "target", "deadline", "saving"],
      ({ goals }) => {
        const count = goals.filter(
          (goal) => goal.status === "active" && !goal.is_archived,
        ).length;
        return count > 0
          ? `${count} active ${count === 1 ? "goal" : "goals"}; see pace and dates`
          : null;
      },
    ),
    load: loadGoalOutlook,
    component: lazy(loadGoalOutlook),
    ...compact(loadGoalOutlookCompact),
    availability: goalOutlookAvailability,
    math: goalOutlookMath,
  },
  {
    id: "landing",
    title: "Month landing",
    description: "Where this month may land after known and usual remaining spend.",
    defaultVisible: true,
    fixedWindow: true,
    gallery: gallery(
      "forecasts",
      ["month end", "forecast", "kept", "range", "usual spending"],
      (context) => {
        const landing = context.aggregates.monthLanding(context.today);
        return monthLandingAvailability(context).status === "ready"
          ? `${formatCents(landing.likelyKept)} likely kept by month end`
          : null;
      },
    ),
    load: loadMonthLanding,
    component: lazy(loadMonthLanding),
    ...compact(loadMonthLandingCompact),
    availability: monthLandingAvailability,
    math: monthLandingMath,
  },
  {
    id: "monthly",
    title: "Month by month",
    description: "Income, expenses, savings, and budget over time.",
    defaultVisible: true,
    gallery: gallery("analysis", ["monthly", "trend", "budget", "history"]),
    ...legacy("monthly"),
  },
  {
    id: "waterfall",
    title: "Income → expenses → savings",
    description: "How the period's income became spending and savings.",
    defaultVisible: true,
    gallery: gallery("analysis", ["income", "expense", "savings", "waterfall"]),
    ...legacy("waterfall"),
  },
  {
    id: "trend",
    title: "Category over time",
    description: "One category's monthly spending against its budget.",
    defaultVisible: true,
    gallery: gallery("analysis", ["category", "budget", "history", "trend"]),
    ...legacy("trend"),
  },
  {
    id: "flows",
    title: "Container flows",
    description: "Money transferred into and out of each container.",
    defaultVisible: true,
    gallery: gallery("analysis", ["container", "account", "transfer", "flow"]),
    ...legacy("flows"),
  },
  {
    id: "investments",
    title: "Investments",
    description: "Value, contributions, and gain or loss for each investment.",
    defaultVisible: true,
    gallery: gallery("analysis", ["investment", "value", "return", "snapshot"]),
    ...legacy("investments"),
  },
  {
    id: "budgets",
    title: "Budget comparison",
    description: "Average spending against allowances by category.",
    defaultVisible: true,
    gallery: gallery("planning", ["budget", "allowance", "category", "average"]),
    ...legacy("budgets"),
  },
];
