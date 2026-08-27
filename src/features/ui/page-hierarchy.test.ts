import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

it("uses direct screen names as page headings app-wide", () => {
  const pageHeaders = [
    ["../categories/CategoriesView.tsx", "Categories"],
    ["../containers/ContainersView.tsx", "Containers"],
    ["../goals/GoalsView.tsx", "Goals"],
    ["../inbox/InboxView.tsx", "Inbox"],
    ["../plan/PlanView.tsx", "Plan"],
    ["../recurring/RecurringView.tsx", "Recurring"],
    ["../settings/SettingsView.tsx", "Settings"],
    ["../reports/DashboardView.tsx", "Dashboard"],
  ] as const;

  for (const [path, title] of pageHeaders) {
    expect(source(path)).toContain(`title="${title}"`);
  }
  expect(source("../ledger/LedgerView.tsx")).toMatch(/<h1[^>]*>Ledger<\/h1>/);
  expect(source("../cravings/CravingsView.tsx")).toMatch(/<h1[^>]*>Cravings<\/h1>/);
});

it("removes the former editorial page titles", () => {
  const files = [
    "../categories/CategoriesView.tsx",
    "../containers/ContainersView.tsx",
    "../plan/PlanView.tsx",
    "../reports/DashboardView.tsx",
    "../settings/SettingsView.tsx",
  ];
  const combined = files.map(source).join("\n");

  expect(combined).not.toMatch(
    /What your money does|Where your money lives|Every dollar a purpose|How the money moved|Under the hood/,
  );
});
