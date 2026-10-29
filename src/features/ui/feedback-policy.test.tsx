import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { InlineError } from "@/features/ui/InlineError";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("deliberate feedback policy", () => {
  it.each([
    ["../ledger/EditTransactionSheet.tsx", /Transaction updated|Transfer updated/],
    ["../categories/CategoriesView.tsx", /Category added|Icon set|Icon cleared|Renamed/],
    ["../categories/BudgetSheet.tsx", /Budget replaced|Budget updated|Budget set/],
    ["../containers/ContainersView.tsx", /Container added|Counted in overall|Default wallet/],
    ["../containers/LogBalanceSheet.tsx", /Report replaced|Report corrected|Balance reported/],
    ["../goals/GoalsView.tsx", /Goal updated|Goal created/],
    ["../recurring/RecurringView.tsx", /Recurring updated|Recurring added/],
    ["../shell/QuickAddSheet.tsx", /toast\.success\("Logged"/],
    ["../plan/PlanView.tsx", /Expected income updated/],
  ])("does not toast routine success in %s", (path, forbidden) => {
    expect(source(path)).not.toMatch(forbidden);
  });

  it.each([
    "../categories/CategorySheet.tsx",
    "../containers/ContainerSheet.tsx",
    "../categories/BudgetSheet.tsx",
    "../goals/GoalSheet.tsx",
    "../recurring/RecurringRuleSheet.tsx",
    "../ledger/EditTransactionSheet.tsx",
  ])("uses accessible inline errors instead of validation toasts in %s", (path) => {
    const contents = source(path);
    expect(contents).toContain("<InlineError");
    expect(contents).not.toMatch(/return toast\.error/);
  });

  it("keeps errors and undo-capable destructive feedback", () => {
    expect(source("../store.ts")).toContain(`toast.error("Couldn't save that change."`);
    expect(source("../ledger/LedgerView.tsx")).toContain('toast.success("Deleted"');
    expect(source("../ledger/LedgerView.tsx")).toContain("action:");
    expect(source("../inbox/InboxView.tsx")).toMatch(/toast\.success\([^)]*"Dismissed"/s);
    expect(source("../inbox/InboxView.tsx")).toContain("action:");
  });

  it.each([
    "../categories/CategoriesView.tsx",
    "../containers/ContainersView.tsx",
    "../goals/GoalsView.tsx",
    "../recurring/RecurringView.tsx",
  ])("highlights the affected row after routine mutations in %s", (path) => {
    const contents = source(path);
    expect(contents).toContain("flashRowAtom");
    // The mark is read through `useFlashRow`, which owns the atom and adds the
    // scroll a `?focus=` result needs; naming the atom directly is the older
    // spelling of the same policy.
    expect(contents).toMatch(/useFlashRow|flashedRowAtom/);
    expect(contents).toContain("bg-primary/15");
  });
});

describe("InlineError", () => {
  it("provides stable accessible alert semantics", () => {
    const error = InlineError({ id: "name-error", children: "Name is required." });

    expect(error.props.id).toBe("name-error");
    expect(error.props.role).toBe("alert");
    expect(error.props["aria-live"]).toBe("polite");
    expect(error.props.children).toBe("Name is required.");
  });
});
