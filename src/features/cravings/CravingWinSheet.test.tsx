import { expect, it, vi } from "vitest";
import { makeCravingWin } from "@/core/model";
import { CravingWinFormSheet, CravingWinSheet } from "./CravingWinSheet";

const fixture = vi.hoisted(() => ({
  values: new Map<string, unknown>(),
  setters: new Map<string, ReturnType<typeof vi.fn>>(),
}));

vi.mock("jotai", () => ({
  useAtomValue: (atom: string) => fixture.values.get(atom),
  useSetAtom: (atom: string) => fixture.setters.get(atom),
}));

vi.mock("@/features/store", () => ({
  categoriesAtom: "categories",
  containersAtom: "containers",
  cravingWinsAtom: "cravingWins",
  cravingWinSheetAtom: "cravingWinSheet",
  defaultContainerIdAtom: "defaultContainerId",
  dispatchManyAtom: "dispatchMany",
  flashRowAtom: "flashRow",
  goalsAtom: "goals",
  runGoalMaintenanceAtom: "maintainGoals",
  transactionsAtom: "transactions",
}));

it("adapts the globally selected win to the shared form sheet", () => {
  const win = makeCravingWin({
    id: "win-1",
    description: "Takeout",
    amount_kept: 2400,
    date: "2026-08-26",
    occurred_at: "2026-08-26T23:15:00.000Z",
  });
  const setSelected = vi.fn();
  fixture.values.set("cravingWinSheet", win.id);
  fixture.values.set("cravingWins", [win]);
  fixture.values.set("categories", []);
  fixture.values.set("containers", []);
  fixture.values.set("goals", []);
  fixture.values.set("transactions", []);
  fixture.values.set("defaultContainerId", "general");
  fixture.setters.set("cravingWinSheet", setSelected);
  fixture.setters.set("dispatchMany", vi.fn());
  fixture.setters.set("flashRow", vi.fn());
  fixture.setters.set("maintainGoals", vi.fn());

  const sheet = CravingWinSheet();
  expect(sheet.type).toBe(CravingWinFormSheet);
  expect(sheet.props.open).toBe(true);
  expect(sheet.props.existing).toBe(win);

  sheet.props.onOpenChange(false);
  expect(setSelected).toHaveBeenCalledWith(null);
});

it("stays closed for a stale selected id", () => {
  fixture.values.set("cravingWinSheet", "missing");
  fixture.values.set("cravingWins", []);
  fixture.values.set("categories", []);
  fixture.values.set("containers", []);
  fixture.values.set("goals", []);
  fixture.values.set("transactions", []);
  fixture.values.set("defaultContainerId", "general");
  fixture.setters.set("cravingWinSheet", vi.fn());
  fixture.setters.set("dispatchMany", vi.fn());
  fixture.setters.set("flashRow", vi.fn());
  fixture.setters.set("maintainGoals", vi.fn());

  expect(CravingWinSheet().props.open).toBe(false);
});
