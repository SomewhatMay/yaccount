import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import prettier from "prettier";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = resolve(
  root,
  "test-data/yaccount-dashboard-widget-lab-2026-08-26.json",
);
const outputPath = resolve(root, "public/demo-save/yaccount-demo-save.json");
const dayMs = 24 * 60 * 60 * 1000;
const sourceAnchor = "2026-08-26";
const sampleAnchor = "2026-10-11";
const today = process.env.DEMO_TODAY ?? sampleAnchor;
const parsedToday = Date.parse(`${today}T00:00:00.000Z`);
if (
  !/^\d{4}-\d{2}-\d{2}$/.test(today) ||
  Number.isNaN(parsedToday) ||
  new Date(parsedToday).toISOString().slice(0, 10) !== today
) {
  throw new Error("DEMO_TODAY must be a valid YYYY-MM-DD date");
}

function dayDistance(from, to) {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / dayMs,
  );
}

const shiftDays = dayDistance(sourceAnchor, today);
const sampleShiftDays = dayDistance(sampleAnchor, today);

const source = JSON.parse(readFileSync(sourcePath, "utf8"));

function shiftDate(value) {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const dateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value);
  if (!dateOnly && !dateTime) return value;
  const instant = new Date(dateOnly ? `${value}T00:00:00.000Z` : value);
  instant.setTime(instant.getTime() + shiftDays * dayMs);
  return dateOnly ? instant.toISOString().slice(0, 10) : instant.toISOString();
}

function shiftDates(value) {
  if (typeof value === "string") return shiftDate(value);
  if (Array.isArray(value)) return value.map(shiftDates);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, shiftDates(item)]),
  );
}

const ops = source.ops.map((op) => {
  const shifted = shiftDates(op);
  if (shifted.payload?.row?.date && shifted.payload.row.yearMonth) {
    shifted.payload.row.yearMonth = shifted.payload.row.date.slice(0, 7);
  }
  const supportedIcon = {
    BriefcaseBusiness: "Briefcase",
    Repeat2: "Calendar",
    ReceiptText: "Receipt",
    EyeOff: "HandCoins",
  }[shifted.payload?.row?.icon];
  if (supportedIcon) shifted.payload.row.icon = supportedIcon;
  return shifted;
});

function op(id, ts, type, row) {
  return { id, ts, type, payload: { row } };
}

function addDays(date, days) {
  const instant = new Date(`${date}T00:00:00.000Z`);
  instant.setTime(instant.getTime() + days * dayMs);
  return instant.toISOString().slice(0, 10);
}

function rebaseSampleDate(value) {
  const [date, time] = value.split("T");
  const shifted = addDays(date, sampleShiftDays);
  return time ? `${shifted}T${time}` : shifted;
}

function makeTransfer({ id, date, amount, to, notes }) {
  return {
    id,
    date,
    amount: -amount,
    vendor_source: `Craving win → ${to === "vacation" ? "Japan 2027" : "Laptop fund"}`,
    category_id: null,
    container_id: "general",
    to_container_id: to,
    is_template: false,
    template_name: null,
    inbox_status: "approved",
    recurring_rule_id: null,
    recurring_occurrence_date: null,
    notes,
    reverses_id: null,
    entered_at: `${date}T19:15:00.000Z`,
    yearMonth: date.slice(0, 7),
  };
}

function makeTemplate({ id, name, vendor, amount, category, to }) {
  const isTransfer = Boolean(to);
  return {
    id,
    date: "2000-01-01",
    amount,
    vendor_source: vendor,
    category_id: isTransfer ? null : category,
    container_id: "general",
    to_container_id: to ?? null,
    is_template: true,
    template_name: name,
    inbox_status: "approved",
    recurring_rule_id: null,
    recurring_occurrence_date: null,
    notes: null,
    reverses_id: null,
    entered_at: null,
    yearMonth: "2000-01",
  };
}

const kitchenContainer = {
  id: "kitchen",
  name: "Kitchen refresh",
  is_investment: false,
  include_in_overall_balance: false,
  is_archived: false,
};
const cameraContainer = {
  id: "camera",
  name: "Camera fund",
  is_investment: false,
  include_in_overall_balance: false,
  is_archived: false,
};
ops.push(
  op(
    "demo-container-kitchen",
    `${today}T12:01:00.000Z`,
    "container.create",
    kitchenContainer,
  ),
);
ops.push(
  op(
    "demo-container-camera",
    `${today}T12:01:10.000Z`,
    "container.create",
    cameraContainer,
  ),
);
ops.push(
  op("demo-rule-daily-sweep", `${today}T12:01:30.000Z`, "recurringRule.create", {
    id: "rule-daily-sweep",
    frequency: "daily",
    interval_config: {},
    template_amount: 100,
    template_vendor_source: "Daily savings sweep",
    template_category_id: null,
    template_container_id: "general",
    template_to_container_id: "savings",
    amount_mode: "fixed",
    linked_goal_id: null,
    start_date: today,
    end_date: null,
    next_generation_date: addDays(today, 1),
    status: "active",
  }),
);
ops.push(
  op("demo-category-old-streaming", `${today}T12:02:00.000Z`, "category.create", {
    id: "old-streaming",
    name: "Former streaming service",
    type: "expense",
    is_archived: true,
    excluded_from_stats: false,
    color: null,
    icon: "Tv",
  }),
);
ops.push(
  op("demo-goal-kitchen", `${today}T12:03:00.000Z`, "goal.create", {
    id: "goal-kitchen",
    container_id: kitchenContainer.id,
    name: "Kitchen refresh",
    kind: "spend_down",
    mode: "fixed",
    target_amount: 180000,
    deadline: null,
    planned_monthly: 25000,
    opening_contributed: 180000,
    status: "completed",
    is_archived: false,
    created_date: rebaseSampleDate("2026-03-01"),
    completed_date: rebaseSampleDate("2026-09-20"),
  }),
);
ops.push(
  op("demo-goal-camera", `${today}T12:03:30.000Z`, "goal.create", {
    id: "goal-camera",
    container_id: cameraContainer.id,
    name: "Camera upgrade",
    kind: "spend_down",
    mode: "fixed",
    target_amount: 120000,
    deadline: null,
    planned_monthly: 15000,
    opening_contributed: 0,
    status: "cancelled",
    is_archived: false,
    created_date: rebaseSampleDate("2026-04-01"),
    completed_date: null,
  }),
);
ops.push(
  op("demo-goal-old-wallet", `${today}T12:03:40.000Z`, "goal.create", {
    id: "goal-old-wallet",
    container_id: "old-wallet",
    name: "Old travel fund",
    kind: "spend_down",
    mode: "passive",
    target_amount: null,
    deadline: null,
    planned_monthly: null,
    opening_contributed: 0,
    status: "active",
    is_archived: true,
    created_date: rebaseSampleDate("2025-01-01"),
    completed_date: null,
  }),
);

const cravingWins = [
  {
    id: "demo-craving-japan",
    date: rebaseSampleDate("2026-10-04"),
    occurred_at: rebaseSampleDate("2026-10-04T18:50:00.000Z"),
    description: "Skipped a takeout order",
    amount_kept: 4500,
    category_id: "dining",
    reflection:
      "Dinner at home was already planned; moved the difference to the trip fund.",
    goal_id: "goal-vacation",
    transfer_transaction_id: "demo-transfer-japan-win",
    transfer_date: rebaseSampleDate("2026-10-04"),
    to: "vacation",
    note: "Kept from takeout and moved toward Japan 2027.",
  },
  {
    id: "demo-craving-laptop",
    date: rebaseSampleDate("2026-10-08"),
    occurred_at: rebaseSampleDate("2026-10-08T16:30:00.000Z"),
    description: "Walked instead of calling a ride",
    amount_kept: 3200,
    category_id: "transport",
    reflection: "The weather was good and the walk cleared my head.",
    goal_id: "goal-laptop",
    transfer_transaction_id: "demo-transfer-laptop-win",
    transfer_date: rebaseSampleDate("2026-10-08"),
    to: "laptop",
    note: "Kept from a ride and moved toward the laptop fund.",
  },
  {
    id: "demo-craving-unlinked",
    date: rebaseSampleDate("2026-10-10"),
    occurred_at: rebaseSampleDate("2026-10-10T15:10:00.000Z"),
    description: "Passed on an impulse purchase",
    amount_kept: 2100,
    category_id: "dining",
    reflection: "Waited a day and decided I did not need it.",
    goal_id: null,
    transfer_transaction_id: null,
  },
];

for (const win of cravingWins) {
  const { transfer_date, to, note, ...row } = win;
  if (row.transfer_transaction_id) {
    const transfer = makeTransfer({
      id: row.transfer_transaction_id,
      date: transfer_date,
      amount: row.amount_kept,
      to,
      notes: note,
    });
    ops.push(
      op(
        `op-${transfer.id}`,
        `${transfer_date}T19:16:00.000Z`,
        "transaction.create",
        transfer,
      ),
    );
  }
  ops.push(
    op(
      `op-${row.id}`,
      `${row.occurred_at.slice(0, 10)}T19:20:00.000Z`,
      "cravingWin.create",
      row,
    ),
  );
}

for (const template of [
  {
    id: "demo-template-groceries",
    name: "Weekly groceries",
    vendor: "Fresh Foods",
    amount: -8750,
    category: "groceries",
  },
  {
    id: "demo-template-payday",
    name: "Payday",
    vendor: "Northstar Payroll",
    amount: 500000,
    category: "salary",
  },
  {
    id: "demo-template-transfer",
    name: "Move to savings",
    vendor: "Monthly savings move",
    amount: 25000,
    to: "savings",
  },
]) {
  ops.push(
    op(
      `op-${template.id}`,
      `${today}T12:04:00.000Z`,
      "template.create",
      makeTemplate(template),
    ),
  );
}

const allWidgetTypes = [
  "balance",
  "brief",
  "money-map",
  "pace",
  "recent",
  "cravings",
  "saved",
  "flow",
  "calendar",
  "breakdown",
  "payees",
  "commitments",
  "upcoming",
  "allocation",
  "largest",
  "goals",
  "landing",
  "resilience",
  "watch-container",
  "watch-category",
  "monthly",
  "waterfall",
  "flows",
  "investments",
  "budgets",
];
const plans = [
  {
    oldId: "lab-compact",
    id: "demo-overview",
    name: "01 · Overview",
    visible: [
      "balance",
      "brief",
      "pace",
      "recent",
      "allocation",
      "goals",
      "landing",
      "cravings",
    ],
  },
  {
    oldId: "lab-planning",
    id: "demo-planning",
    name: "02 · Planning",
    visible: [
      "balance",
      "brief",
      "pace",
      "commitments",
      "upcoming",
      "allocation",
      "goals",
      "recent",
    ],
  },
  {
    oldId: "lab-forecast",
    id: "demo-forecast",
    name: "03 · Forecasts & Watch",
    visible: ["balance", "money-map", "landing", "watch-container", "watch-category"],
  },
  {
    oldId: "lab-analysis",
    id: "demo-analysis",
    name: "04 · Analysis",
    visible: [
      "balance",
      "saved",
      "flow",
      "calendar",
      "breakdown",
      "payees",
      "largest",
      "resilience",
      "monthly",
      "waterfall",
      "flows",
      "investments",
      "budgets",
      "recent",
    ],
  },
];

const settingsOps = ops.filter(
  (entry) =>
    entry.type === "setting.set" &&
    entry.payload.row.key.startsWith("dashboard.v2.item."),
);
for (const plan of plans) {
  const sourceOp = settingsOps.find(
    (entry) => entry.payload.row.key === `dashboard.v2.item.${plan.oldId}`,
  );
  if (!sourceOp) throw new Error(`Missing dashboard source ${plan.oldId}`);
  const dashboard = JSON.parse(sourceOp.payload.row.value);
  dashboard.id = plan.id;
  dashboard.name = plan.name;
  dashboard.rank = Number(plan.name.slice(0, 2)) - 1;

  for (const [index, instance] of dashboard.instances.entries()) {
    instance.instanceId = `${plan.id}-${index + 1}`;
    instance.hidden = !plan.visible.includes(instance.widgetType);
  }
  for (const widgetType of allWidgetTypes) {
    if (dashboard.instances.some((instance) => instance.widgetType === widgetType))
      continue;
    dashboard.instances.push({
      instanceId: `${plan.id}-${widgetType}`,
      widgetType,
      size: "expanded",
      hidden: !plan.visible.includes(widgetType),
    });
  }

  sourceOp.payload.row.key = `dashboard.v2.item.${plan.id}`;
  sourceOp.payload.row.value = JSON.stringify(dashboard);
}

const defaultDashboard = ops.find(
  (entry) =>
    entry.type === "setting.set" && entry.payload.row.key === "dashboard.v2.default",
);
if (!defaultDashboard) throw new Error("Missing default dashboard setting");
defaultDashboard.payload.row.value = "demo-overview";

const output = {
  ...source,
  exportedAt: shiftDate(source.exportedAt),
  deviceId: null,
  ops: ops.sort((a, b) => a.ts.localeCompare(b.ts) || a.id.localeCompare(b.id)),
};
output.opCount = output.ops.length;

mkdirSync(dirname(outputPath), { recursive: true });
const formattedOutput = await prettier.format(JSON.stringify(output, null, 2), {
  filepath: outputPath,
});
writeFileSync(outputPath, formattedOutput);
process.stdout.write(`Wrote ${output.opCount} changes to ${outputPath}\n`);
