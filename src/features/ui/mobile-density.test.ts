import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

it("uses the provisional phone density values without tightening desktop", () => {
  expect(read("../AppShell.tsx")).toContain(
    'className={cn("mx-auto px-5 pt-3 sm:pt-5", maxWidth)}',
  );

  const dashboard = read("../reports/DashboardView.tsx");
  expect(dashboard).toContain('className="grid gap-3 md:grid-cols-2 md:gap-6"');
  expect(dashboard).toContain('className="space-y-3 md:space-y-6"');
  expect(dashboard).toContain('className="grid gap-3 lg:grid-cols-2 lg:gap-6"');

  const widgets = read("../reports/WidgetShell.tsx");
  expect(widgets.match(/p-4 sm:p-5/g)).toHaveLength(2);
});

it("tightens only top-level non-dashboard phone stacks", () => {
  for (const path of [
    "../categories/CategoriesView.tsx",
    "../containers/ContainersView.tsx",
    "../cravings/CravingsView.tsx",
    "../goals/GoalsView.tsx",
    "../inbox/InboxView.tsx",
    "../ledger/LedgerView.tsx",
    "../plan/PlanView.tsx",
    "../recurring/RecurringView.tsx",
  ]) {
    expect(read(path), path).toContain('className="space-y-4 sm:space-y-6"');
  }
});
