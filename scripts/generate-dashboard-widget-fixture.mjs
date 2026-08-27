import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "prettier";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = resolve(ROOT, "test-data/yaccount-dashboard-widget-lab-2026-08-26.json");
const BASE_TIME = Date.parse("2026-08-26T12:00:00.000Z");
const ops = [];
const transactions = new Map();
let sequence = 0;

function record(type, payloadFor) {
  sequence += 1;
  const ts = new Date(BASE_TIME + sequence * 1_000).toISOString();
  ops.push({
    id: `widget-lab-op-${String(sequence).padStart(4, "0")}`,
    ts,
    type,
    payload: payloadFor(ts),
  });
}

function addRow(type, row) {
  record(type, () => ({ row }));
}

function addCategory(id, name, type, options = {}) {
  addRow("category.create", {
    id,
    name,
    type,
    is_archived: false,
    excluded_from_stats: options.excluded ?? false,
    color: null,
    icon: options.icon ?? null,
  });
}

function addContainer(id, name, options = {}) {
  addRow("container.create", {
    id,
    name,
    is_investment: options.investment ?? false,
    include_in_overall_balance: options.counted ?? false,
    is_archived: options.archived ?? false,
  });
}

function addTransaction({
  id,
  date,
  amount,
  vendor,
  category,
  container = "checking",
  status = "approved",
  recurringRule = null,
  occurrenceDate = null,
  notes = null,
}) {
  record("transaction.create", (ts) => {
    const row = {
      id,
      date,
      amount,
      vendor_source: vendor,
      category_id: category,
      container_id: container,
      to_container_id: null,
      is_template: false,
      template_name: null,
      inbox_status: status,
      recurring_rule_id: recurringRule,
      recurring_occurrence_date: occurrenceDate,
      notes,
      reverses_id: null,
      entered_at: ts,
      yearMonth: date.slice(0, 7),
    };
    transactions.set(id, row);
    return { row };
  });
}

function addTransfer({ id, date, amount, from, to, vendor, status = "approved" }) {
  record("transaction.create", (ts) => {
    const row = {
      id,
      date,
      amount: -Math.abs(amount),
      vendor_source: vendor,
      category_id: null,
      container_id: from,
      to_container_id: to,
      is_template: false,
      template_name: null,
      inbox_status: status,
      recurring_rule_id: null,
      recurring_occurrence_date: null,
      notes: null,
      reverses_id: null,
      entered_at: ts,
      yearMonth: date.slice(0, 7),
    };
    transactions.set(id, row);
    return { row };
  });
}

function addVoid(id, originalId, date) {
  const original = transactions.get(originalId);
  if (!original) throw new Error(`missing transaction ${originalId}`);
  record("transaction.void", (ts) => {
    const row = {
      ...original,
      id,
      date,
      amount: original.amount === 0 ? 0 : -original.amount,
      reverses_id: original.id,
      entered_at: ts,
      yearMonth: date.slice(0, 7),
    };
    transactions.set(id, row);
    return { row };
  });
}

function addBudget(id, category, amount) {
  addRow("budgetTarget.set", {
    id,
    category_id: category,
    amount,
    start_date: "2026-01-01",
  });
}

function addSnapshot(id, container, date, balance) {
  addRow("snapshot.record", {
    id,
    container_id: container,
    date,
    reported_balance: balance,
  });
}

function addRecurring({
  id,
  frequency,
  interval,
  amount,
  vendor,
  category = null,
  container = "general",
  to = null,
  mode = "fixed",
  goal = null,
  start = "2026-01-01",
  end = null,
  next,
  status = "active",
}) {
  addRow("recurringRule.create", {
    id,
    frequency,
    interval_config: interval,
    template_amount: amount,
    template_vendor_source: vendor,
    template_category_id: category,
    template_container_id: container,
    template_to_container_id: to,
    amount_mode: mode,
    linked_goal_id: goal,
    start_date: start,
    end_date: end,
    next_generation_date: next,
    status,
  });
}

function addGoal({
  id,
  container,
  name,
  kind,
  mode,
  target = null,
  deadline = null,
  monthly = null,
  opening = 0,
}) {
  addRow("goal.create", {
    id,
    container_id: container,
    name,
    kind,
    mode,
    target_amount: target,
    deadline,
    planned_monthly: monthly,
    opening_contributed: opening,
    status: "active",
    is_archived: false,
    created_date: "2026-01-01",
    completed_date: null,
  });
}

function instance(instanceId, widgetType, size = "expanded", options = {}) {
  return {
    instanceId,
    widgetType,
    size,
    hidden: false,
    ...(options.subject ? { subject: options.subject } : {}),
    ...(options.settings ? { settings: options.settings } : {}),
  };
}

function addDashboard(id, name, rank, instances) {
  const value = JSON.stringify({
    version: 2,
    id,
    name,
    rank,
    isDeleted: false,
    instances,
  });
  addRow("setting.set", { key: `dashboard.v2.item.${id}`, value });
}

function addSetting(key, value) {
  addRow("setting.set", { key, value });
}

// Categories: real report inputs plus one explicit stats-hidden boundary.
addCategory("opening", "Opening balance", "income", {
  excluded: true,
  icon: "Landmark",
});
addCategory("salary", "Salary", "income", { icon: "BriefcaseBusiness" });
addCategory("freelance", "Freelance", "income", { icon: "Laptop" });
addCategory("interest", "Interest", "income", { icon: "TrendingUp" });
addCategory("housing", "Housing", "expense", { icon: "House" });
addCategory("groceries", "Groceries", "expense", { icon: "ShoppingCart" });
addCategory("dining", "Dining", "expense", { icon: "Utensils" });
addCategory("utilities", "Utilities", "expense", { icon: "Zap" });
addCategory("transport", "Transport", "expense", { icon: "Car" });
addCategory("subscriptions", "Subscriptions", "expense", { icon: "Repeat2" });
addCategory("travel", "Travel", "expense", { icon: "Plane" });
addCategory("medical", "Medical", "expense", { icon: "HeartPulse" });
addCategory("gifts", "Gifts", "expense", { icon: "Gift" });
addCategory("insurance", "Insurance", "expense", { icon: "ShieldCheck" });
addCategory("education", "Education", "expense", { icon: "GraduationCap" });
addCategory("taxes", "Taxes", "expense", { icon: "ReceiptText" });
addCategory("reimbursable", "Reimbursable", "expense", {
  excluded: true,
  icon: "EyeOff",
});

// Containers: counted cash, historical/reporting locations, goals, and investments.
addContainer("general", "General", { counted: true });
addContainer("checking", "Household checking");
addContainer("savings", "Long-term savings");
addContainer("emergency", "Emergency reserve");
addContainer("vacation", "Japan 2027");
addContainer("laptop", "Laptop fund");
addContainer("skills", "Skills fund");
addContainer("health", "Health reserve");
addContainer("brokerage", "Brokerage", { investment: true, counted: true });
addContainer("retirement", "Retirement", { investment: true });
addContainer("old-wallet", "Old wallet", { archived: true });

// Opening/current values. Opening balance is intentionally hidden from reports.
addTransaction({
  id: "opening-general",
  date: "2026-08-01",
  amount: 250_000,
  vendor: "General opening balance",
  category: "opening",
  container: "general",
});
addTransaction({
  id: "opening-checking",
  date: "2026-01-01",
  amount: 100_000,
  vendor: "Checking opening balance",
  category: "opening",
});
addTransaction({
  id: "opening-savings",
  date: "2026-01-01",
  amount: 200_000,
  vendor: "Savings opening balance",
  category: "opening",
  container: "savings",
});
for (const [id, container, amount] of [
  ["opening-emergency", "emergency", 650_000],
  ["opening-vacation", "vacation", 150_000],
  ["opening-laptop", "laptop", 60_000],
  ["opening-skills", "skills", 20_000],
  ["opening-health", "health", 100_000],
]) {
  addTransaction({
    id,
    date: "2026-01-01",
    amount,
    vendor: `${container} opening balance`,
    category: "opening",
    container,
  });
}

const freelanceIncome = [50_000, 80_000, 0, 140_000, 60_000, 220_000, 100_000];
const grocerySpend = [58_000, 61_000, 55_000, 66_000, 63_000, 72_000, 69_000];
const diningSpend = [22_000, 25_000, 19_000, 28_000, 31_000, 42_000, 45_000];
const utilitySpend = [24_000, 31_000, 22_000, 29_000, 27_000, 34_000, 26_000];
const travelSpend = [8_000, 0, 12_000, 6_000, 20_000, 55_000, 65_000];

for (let month = 1; month <= 7; month += 1) {
  const mm = String(month).padStart(2, "0");
  const monthKey = `2026-${mm}`;
  const utilityDay = month === 2 ? "28" : "30";
  addTransaction({
    id: `salary-${mm}`,
    date: `${monthKey}-27`,
    amount: 500_000,
    vendor: "Northstar Payroll",
    category: "salary",
    recurringRule: "rule-salary",
    occurrenceDate: `${monthKey}-28`,
  });
  if (freelanceIncome[month - 1] > 0) {
    addTransaction({
      id: `freelance-${mm}`,
      date: `${monthKey}-18`,
      amount: freelanceIncome[month - 1],
      vendor: "Studio invoices",
      category: "freelance",
    });
  }
  addTransaction({
    id: `interest-${mm}`,
    date: `${monthKey}-20`,
    amount: 1_000 + month * 100,
    vendor: "Savings interest",
    category: "interest",
    container: "savings",
  });
  addTransaction({
    id: `rent-${mm}`,
    date: `${monthKey}-01`,
    amount: -180_000,
    vendor: "Parkside Property",
    category: "housing",
    recurringRule: "rule-rent",
    occurrenceDate: `${monthKey}-01`,
  });
  addTransaction({
    id: `groceries-market-${mm}`,
    date: `${monthKey}-08`,
    amount: -Math.round(grocerySpend[month - 1] * 0.65),
    vendor: "Market Square",
    category: "groceries",
  });
  addTransaction({
    id: `groceries-fresh-${mm}`,
    date: `${monthKey}-22`,
    amount: -(grocerySpend[month - 1] - Math.round(grocerySpend[month - 1] * 0.65)),
    vendor: "Fresh Foods",
    category: "groceries",
  });
  addTransaction({
    id: `dining-cafe-${mm}`,
    date: `${monthKey}-12`,
    amount: -Math.round(diningSpend[month - 1] * 0.6),
    vendor: "Corner Cafe",
    category: "dining",
  });
  addTransaction({
    id: `dining-kitchen-${mm}`,
    date: `${monthKey}-24`,
    amount: -(diningSpend[month - 1] - Math.round(diningSpend[month - 1] * 0.6)),
    vendor: "Neighborhood Kitchen",
    category: "dining",
  });
  addTransaction({
    id: `utilities-${mm}`,
    date: `${monthKey}-${utilityDay}`,
    amount: -utilitySpend[month - 1],
    vendor: "City Utilities",
    category: "utilities",
    recurringRule: "rule-utilities",
    occurrenceDate: `${monthKey}-${utilityDay}`,
  });
  addTransaction({
    id: `transport-${mm}`,
    date: `${monthKey}-16`,
    amount: -(12_000 + month * 700),
    vendor: "Metro and fuel",
    category: "transport",
  });
  addTransaction({
    id: `streaming-${mm}`,
    date: `${monthKey}-27`,
    amount: -10_000,
    vendor: "Stream bundle",
    category: "subscriptions",
    recurringRule: "rule-streaming",
    occurrenceDate: `${monthKey}-27`,
  });
  if (travelSpend[month - 1] > 0) {
    addTransaction({
      id: `travel-${mm}`,
      date: `${monthKey}-14`,
      amount: -travelSpend[month - 1],
      vendor: month >= 6 ? "Japan planning" : "Regional rail",
      category: "travel",
    });
  }
  addTransaction({
    id: `medical-${mm}`,
    date: `${monthKey}-11`,
    amount: -(5_000 + (month % 3) * 7_500),
    vendor: "Neighborhood Clinic",
    category: "medical",
  });
  addTransaction({
    id: `gifts-${mm}`,
    date: `${monthKey}-19`,
    amount: -(5_000 + month * 1_000),
    vendor: "Gifts and celebrations",
    category: "gifts",
  });
  if (month === 3 || month === 7) {
    addTransaction({
      id: `grocery-refund-${mm}`,
      date: `${monthKey}-25`,
      amount: 6_000,
      vendor: "Market Square refund",
      category: "groceries",
    });
  }
  addTransfer({
    id: `savings-sweep-${mm}`,
    date: `${monthKey}-28`,
    amount: 100_000,
    from: "checking",
    to: "savings",
    vendor: "Monthly savings sweep",
  });
  addTransfer({
    id: `brokerage-contribution-${mm}`,
    date: `${monthKey}-28`,
    amount: 30_000,
    from: "checking",
    to: "brokerage",
    vendor: "Brokerage contribution",
  });
}

// Current month: each attention state is deliberate and named for manual review.
addTransaction({
  id: "aug-rent",
  date: "2026-08-01",
  amount: -180_000,
  vendor: "Parkside Property",
  category: "housing",
  recurringRule: "rule-rent",
  occurrenceDate: "2026-08-01",
});
addTransaction({
  id: "aug-groceries-market",
  date: "2026-08-05",
  amount: -50_000,
  vendor: "Market Square",
  category: "groceries",
});
addTransaction({
  id: "aug-groceries-fresh",
  date: "2026-08-23",
  amount: -24_000,
  vendor: "Fresh Foods",
  category: "groceries",
});
addTransaction({
  id: "aug-grocery-refund",
  date: "2026-08-24",
  amount: 6_000,
  vendor: "Market Square refund",
  category: "groceries",
});
addTransaction({
  id: "aug-dining-cafe",
  date: "2026-08-10",
  amount: -18_000,
  vendor: "Corner Cafe",
  category: "dining",
});
addTransaction({
  id: "aug-dining-kitchen",
  date: "2026-08-25",
  amount: -15_000,
  vendor: "Neighborhood Kitchen",
  category: "dining",
});
addTransaction({
  id: "aug-utilities-early",
  date: "2026-08-20",
  amount: -30_000,
  vendor: "City Utilities paid early",
  category: "utilities",
  container: "general",
  recurringRule: "rule-utilities",
  occurrenceDate: "2026-08-30",
});
addTransaction({
  id: "aug-transport",
  date: "2026-08-18",
  amount: -10_000,
  vendor: "Metro and fuel",
  category: "transport",
});
addTransaction({
  id: "aug-subscriptions",
  date: "2026-08-12",
  amount: -10_000,
  vendor: "Cloud storage",
  category: "subscriptions",
});
addTransaction({
  id: "aug-travel",
  date: "2026-08-21",
  amount: -40_000,
  vendor: "Japan planning",
  category: "travel",
});
addTransaction({
  id: "aug-medical",
  date: "2026-08-22",
  amount: -5_000,
  vendor: "Neighborhood Clinic",
  category: "medical",
});
addTransaction({
  id: "aug-gifts",
  date: "2026-08-17",
  amount: -8_000,
  vendor: "Gifts and celebrations",
  category: "gifts",
});
addTransaction({
  id: "aug-hidden-expense",
  date: "2026-08-24",
  amount: -120_000,
  vendor: "Client travel reimbursement pending",
  category: "reimbursable",
});
addTransaction({
  id: "aug-retainer-manual",
  date: "2026-08-23",
  amount: 120_000,
  vendor: "Studio retainer deposit",
  category: "freelance",
  container: "general",
  notes: "Month-close manual-match candidate",
});
addTransaction({
  id: "pending-retainer",
  date: "2026-08-24",
  amount: 120_000,
  vendor: "Studio retainer",
  category: "freelance",
  container: "general",
  status: "pending",
  recurringRule: "rule-retainer",
  occurrenceDate: "2026-08-24",
});
addTransaction({
  id: "pending-streaming",
  date: "2026-08-27",
  amount: -2_500,
  vendor: "Stream bundle",
  category: "subscriptions",
  container: "general",
  status: "pending",
  recurringRule: "rule-streaming",
  occurrenceDate: "2026-08-27",
});
addTransaction({
  id: "pending-coffee",
  date: "2026-08-26",
  amount: -4_500,
  vendor: "Card charge to review",
  category: "dining",
  status: "pending",
});
addTransaction({
  id: "voided-dinner",
  date: "2026-07-20",
  amount: -9_000,
  vendor: "Duplicate dinner",
  category: "dining",
});
addVoid("voided-dinner-reversal", "voided-dinner", "2026-07-20");
addTransfer({
  id: "aug-savings-sweep",
  date: "2026-08-15",
  amount: 100_000,
  from: "checking",
  to: "savings",
  vendor: "Monthly savings sweep",
});
addTransfer({
  id: "aug-brokerage-contribution",
  date: "2026-08-16",
  amount: 50_000,
  from: "checking",
  to: "brokerage",
  vendor: "Brokerage contribution",
});
addTransfer({
  id: "aug-vacation-contribution",
  date: "2026-08-15",
  amount: 30_000,
  from: "checking",
  to: "vacation",
  vendor: "Japan goal contribution",
});
addTransfer({
  id: "aug-emergency-contribution",
  date: "2026-08-15",
  amount: 20_000,
  from: "checking",
  to: "emergency",
  vendor: "Emergency reserve contribution",
});
addTransfer({
  id: "retirement-contribution",
  date: "2026-06-10",
  amount: 100_000,
  from: "checking",
  to: "retirement",
  vendor: "Retirement contribution",
});

for (const [id, category, amount] of [
  ["budget-housing", "housing", 180_000],
  ["budget-groceries", "groceries", 70_000],
  ["budget-dining", "dining", 30_000],
  ["budget-utilities", "utilities", 45_000],
  ["budget-transport", "transport", 25_000],
  ["budget-subscriptions", "subscriptions", 15_000],
  ["budget-travel", "travel", 50_000],
  ["budget-medical", "medical", 30_000],
  ["budget-gifts", "gifts", 20_000],
  ["budget-insurance", "insurance", 15_000],
  ["budget-education", "education", 50_000],
  ["budget-taxes", "taxes", 20_000],
]) {
  addBudget(id, category, amount);
}

addGoal({
  id: "goal-vacation",
  container: "vacation",
  name: "Japan 2027",
  kind: "spend_down",
  mode: "deadline",
  target: 400_000,
  deadline: "2026-12-31",
  opening: 150_000,
});
addGoal({
  id: "goal-emergency",
  container: "emergency",
  name: "Emergency reserve",
  kind: "reserve",
  mode: "fixed",
  target: 1_000_000,
  monthly: 50_000,
});
addGoal({
  id: "goal-laptop",
  container: "laptop",
  name: "Laptop replacement",
  kind: "spend_down",
  mode: "passive",
  target: 200_000,
  opening: 60_000,
});
addGoal({
  id: "goal-skills",
  container: "skills",
  name: "Skills fund",
  kind: "spend_down",
  mode: "fixed",
  monthly: 15_000,
  opening: 20_000,
});
addGoal({
  id: "goal-health",
  container: "health",
  name: "Health reserve",
  kind: "reserve",
  mode: "deadline",
  target: 300_000,
  deadline: "2026-11-30",
});

addRecurring({
  id: "rule-salary",
  frequency: "monthly",
  interval: { day_of_month: 28 },
  amount: 500_000,
  vendor: "Northstar Payroll",
  category: "salary",
  next: "2026-08-28",
});
addRecurring({
  id: "rule-retainer",
  frequency: "monthly",
  interval: { day_of_month: 24 },
  amount: 120_000,
  vendor: "Studio retainer",
  category: "freelance",
  next: "2026-09-24",
});
addRecurring({
  id: "rule-rent",
  frequency: "monthly",
  interval: { day_of_month: 1 },
  amount: -180_000,
  vendor: "Parkside Property",
  category: "housing",
  next: "2026-09-01",
});
addRecurring({
  id: "rule-utilities",
  frequency: "monthly",
  interval: { day_of_month: 30 },
  amount: -17_500,
  vendor: "City Utilities",
  category: "utilities",
  next: "2026-09-30",
});
addRecurring({
  id: "rule-groceries",
  frequency: "weekly",
  interval: { day_of_week: 6 },
  amount: -14_000,
  vendor: "Weekly groceries",
  category: "groceries",
  next: "2026-08-29",
});
addRecurring({
  id: "rule-cleaner",
  frequency: "biweekly",
  interval: { days_of_month: [5, 20] },
  amount: -9_000,
  vendor: "Home cleaning",
  category: "housing",
  next: "2026-09-05",
});
addRecurring({
  id: "rule-streaming",
  frequency: "monthly",
  interval: { day_of_month: 27 },
  amount: -2_500,
  vendor: "Stream bundle",
  category: "subscriptions",
  next: "2026-09-27",
});
addRecurring({
  id: "rule-gym",
  frequency: "monthly",
  interval: { day_of_month: 15 },
  amount: -5_500,
  vendor: "Neighborhood gym",
  category: "medical",
  next: "2026-09-15",
});
addRecurring({
  id: "rule-insurance",
  frequency: "annually",
  interval: { month: 9, day: 15 },
  amount: -120_000,
  vendor: "Annual insurance",
  category: "insurance",
  next: "2026-09-15",
});
addRecurring({
  id: "rule-property-tax",
  frequency: "custom",
  interval: { every: 3, unit: "month" },
  amount: -60_000,
  vendor: "Quarterly property tax",
  category: "taxes",
  start: "2026-09-20",
  next: "2026-09-20",
});
addRecurring({
  id: "rule-tuition",
  frequency: "annually",
  interval: { month: 8, day: 27 },
  amount: -450_000,
  vendor: "Annual tuition",
  category: "education",
  next: "2026-08-27",
});
addRecurring({
  id: "rule-medical-flex",
  frequency: "monthly",
  interval: { day_of_month: 31 },
  amount: null,
  vendor: "Medical flex estimate",
  category: "medical",
  mode: "goal_derived",
  goal: "goal-health",
  next: "2026-08-31",
});
addRecurring({
  id: "rule-auto-invest",
  frequency: "monthly",
  interval: { day_of_month: 29 },
  amount: 50_000,
  vendor: "Brokerage auto-invest",
  to: "brokerage",
  next: "2026-08-29",
});
addRecurring({
  id: "rule-old-phone",
  frequency: "monthly",
  interval: { day_of_month: 15 },
  amount: -8_000,
  vendor: "Cancelled phone plan",
  category: "subscriptions",
  next: "2026-08-15",
  status: "cancelled",
});

addSnapshot("brokerage-feb", "brokerage", "2026-02-01", 500_000);
addSnapshot("brokerage-may", "brokerage", "2026-05-01", 560_000);
addSnapshot("brokerage-aug", "brokerage", "2026-08-25", 620_000);

addDashboard("lab-planning", "01 · Planning", 0, [
  instance("planning-balance", "balance"),
  instance("planning-brief", "brief"),
  instance("planning-pace", "pace"),
  instance("planning-commitments", "commitments", "expanded", {
    settings: { commitmentsMode: "regular" },
  }),
  instance("planning-upcoming", "upcoming", "expanded", {
    settings: { horizonDays: 60 },
  }),
  instance("planning-allocation", "allocation", "expanded", {
    settings: {
      allocationMode: "month",
      payCycleAnchorRuleIds: ["rule-salary"],
    },
  }),
  instance("planning-goals", "goals"),
  instance("planning-recent", "recent"),
]);

addDashboard("lab-forecast", "02 · Forecast & Watch", 1, [
  instance("forecast-balance", "balance"),
  instance("forecast-map", "money-map"),
  instance("forecast-landing", "landing"),
  instance("forecast-general", "watch-container", "expanded", {
    subject: { type: "container", id: "general" },
    settings: { floor: 100_000 },
  }),
  instance("forecast-emergency", "watch-container", "expanded", {
    subject: { type: "container", id: "emergency" },
    settings: { floor: 500_000 },
  }),
  instance("forecast-old", "watch-container", "expanded", {
    subject: { type: "container", id: "old-wallet" },
  }),
  instance("forecast-groceries", "watch-category", "expanded", {
    subject: { type: "category", id: "groceries" },
  }),
  instance("forecast-dining", "watch-category", "expanded", {
    subject: { type: "category", id: "dining" },
  }),
]);

addDashboard("lab-analysis", "03 · Analysis", 2, [
  instance("analysis-balance", "balance"),
  instance("analysis-saved", "saved"),
  instance("analysis-flow", "flow"),
  instance("analysis-calendar", "calendar"),
  instance("analysis-breakdown", "breakdown"),
  instance("analysis-payees", "payees"),
  instance("analysis-largest", "largest"),
  instance("analysis-resilience", "resilience"),
  instance("analysis-monthly", "monthly"),
  instance("analysis-waterfall", "waterfall"),
  instance("analysis-flows", "flows"),
  instance("analysis-investments", "investments"),
  instance("analysis-budgets", "budgets"),
  instance("analysis-recent", "recent"),
]);

addDashboard("lab-compact", "04 · Compact", 3, [
  instance("compact-balance", "balance"),
  instance("compact-brief", "brief", "compact"),
  instance("compact-map", "money-map", "compact"),
  instance("compact-pace", "pace", "compact"),
  instance("compact-saved", "saved", "compact"),
  instance("compact-commitments", "commitments", "compact", {
    settings: { commitmentsMode: "irregular" },
  }),
  instance("compact-upcoming", "upcoming", "compact", {
    settings: { horizonDays: 14 },
  }),
  instance("compact-allocation", "allocation", "compact", {
    settings: {
      allocationMode: "pay-cycle",
      payCycleAnchorRuleIds: ["rule-salary"],
    },
  }),
  instance("compact-goals", "goals", "compact"),
  instance("compact-landing", "landing", "compact"),
  instance("compact-resilience", "resilience", "compact"),
  instance("compact-general", "watch-container", "compact", {
    subject: { type: "container", id: "general" },
    settings: { floor: 100_000 },
  }),
  instance("compact-groceries", "watch-category", "compact", {
    subject: { type: "category", id: "groceries" },
  }),
  instance("compact-recent", "recent", "compact"),
]);

addSetting("dashboard.v2.default", "lab-planning");
addSetting("default_container_id", "general");

const file = {
  format: "yaccount.export",
  version: 1,
  exportedAt: "2026-08-26T12:00:00.000Z",
  appDbVersion: 3,
  deviceId: "dashboard-widget-lab",
  opCount: ops.length,
  ops,
};

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, await format(JSON.stringify(file), { parser: "json" }));
console.log(`${OUTPUT}: ${ops.length} ops`);
