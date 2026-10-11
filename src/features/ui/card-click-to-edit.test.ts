import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { activateCardOnClick } from "./card-interaction";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("click-to-edit cards", () => {
  it.each([
    ["../ledger/LedgerView.tsx", "activateCardOnClick(event, onEdit)"],
    ["../goals/GoalsView.tsx", "activateCardOnClick(event, onEdit)"],
    ["../cravings/CravingsView.tsx", "activateCardOnClick(event, onEdit)"],
    ["../containers/ContainersView.tsx", "activateCardOnClick(event, onEdit)"],
    ["../categories/CategoriesView.tsx", "activateCardOnClick(event, onEdit)"],
    ["../recurring/RecurringView.tsx", "activateCardOnClick(event, onEdit)"],
    [
      "../containers/LogBalanceSheet.tsx",
      "activateCardOnClick(event, () => startEdit(s))",
    ],
  ])("opens the editor when the card body is clicked (%s)", (path, handler) => {
    expect(source(path).includes(handler)).toBe(true);
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
