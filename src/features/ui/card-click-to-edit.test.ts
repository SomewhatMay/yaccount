import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { activateCardOnClick } from "./card-interaction";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("click-to-edit cards", () => {
  it.each([
    "../ledger/LedgerView.tsx",
    "../goals/GoalsView.tsx",
    "../cravings/CravingsView.tsx",
    "../containers/ContainersView.tsx",
    "../categories/CategoriesView.tsx",
    "../recurring/RecurringView.tsx",
    "../containers/LogBalanceSheet.tsx",
  ])("opens the editor when the card body is clicked (%s)", (path) => {
    expect(source(path).includes("activateCardOnClick(event, onEdit)")).toBe(true);
  });

  it("opens from card content", () => {
    const onEdit = vi.fn();
    activateCardOnClick({ target: { closest: () => null } } as never, onEdit);
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it("does not turn nested controls into edit clicks", () => {
    const onEdit = vi.fn();
    activateCardOnClick({ target: { closest: () => ({}) } } as never, onEdit);
    expect(onEdit).not.toHaveBeenCalled();
  });
});
