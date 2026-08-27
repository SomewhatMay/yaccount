import { expect, it, vi } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { makeContainer, makeCravingWin, makeGoal, makeTransfer } from "@/core/model";
import { CravingDeleteDialog, CravingsView } from "./CravingsView";

const fixture = vi.hoisted(() => ({
  values: new Map<string, unknown>(),
  setters: new Map<string, ReturnType<typeof vi.fn>>(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useMemo: <T,>(factory: () => T) => factory(),
    useState: <T,>(initial: T) => [initial, vi.fn()],
  };
});

vi.mock("jotai", () => ({
  useAtomValue: (atom: string) => fixture.values.get(atom),
  useSetAtom: (atom: string) => fixture.setters.get(atom) ?? vi.fn(),
}));

vi.mock("@/features/store", () => ({
  readyAtom: "ready",
  cravingWinsAtom: "cravingWins",
  transactionsAtom: "transactions",
  categoriesAtom: "categories",
  containersAtom: "containers",
  goalsAtom: "goals",
  cravingWinSheetAtom: "cravingWinSheet",
  dispatchManyAtom: "dispatchMany",
  runGoalMaintenanceAtom: "maintainGoals",
  flashRowAtom: "flashRow",
}));

vi.mock("@/features/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/ui")>();
  return {
    ...actual,
    useFlashRow: () => ({ ref: { current: null }, flashed: false }),
  };
});

function findComponent(
  node: ReactNode,
  name: string,
): ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findComponent(child, name);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement<{ children?: ReactNode }>(node)) return null;
  if (typeof node.type === "function" && node.type.name === name) {
    return node as ReactElement<Record<string, unknown>>;
  }
  return findComponent(node.props.children, name);
}

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  if (!isValidElement<{ children?: ReactNode }>(node)) return "";
  return textOf(node.props.children);
}

it("shows all-time, current-month, moved, cumulative, and yearly history", () => {
  const general = makeContainer({ id: "general", name: "General" });
  const tripPot = makeContainer({ id: "trip-pot", name: "Japan trip" });
  const trip = makeGoal({
    id: "trip",
    container_id: tripPot.id,
    name: "Japan trip",
    kind: "spend_down",
    mode: "passive",
    created_date: "2025-01-01",
  });
  const transfer = makeTransfer({
    id: "transfer-1",
    date: "2026-08-20",
    amount: 2400,
    container_id: general.id,
    to_container_id: tripPot.id,
    fromName: general.name,
    toName: tripPot.name,
  });
  const wins = [
    makeCravingWin({
      id: "takeout",
      description: "Takeout",
      amount_kept: 2400,
      date: "2026-08-20",
      occurred_at: "2026-08-20T18:00:00.000Z",
      goal_id: trip.id,
      transfer_transaction_id: transfer.id,
    }),
    makeCravingWin({
      id: "shoes",
      description: "Shoes",
      amount_kept: 5000,
      date: "2025-04-01",
      occurred_at: "2025-04-01T18:00:00.000Z",
    }),
  ];
  const openSheet = vi.fn();
  fixture.values.set("ready", true);
  fixture.values.set("cravingWins", wins);
  fixture.values.set("transactions", [transfer]);
  fixture.values.set("categories", []);
  fixture.values.set("containers", [general, tripPot]);
  fixture.values.set("goals", [trip]);
  fixture.setters.set("cravingWinSheet", openSheet);

  const view = CravingsView({ today: "2026-08-26" });
  const hero = findComponent(view, "CravingsHero")!;
  expect(hero.props.summary).toEqual({
    totalKept: 7400,
    thisMonthKept: 2400,
    winCount: 2,
    movedToGoals: 2400,
  });
  expect(hero.props.series).toEqual([5000, 7400]);
  (hero.props.onNew as () => void)();
  expect(openSheet).toHaveBeenCalledWith("new");

  const register = findComponent(view, "YearRegister")!;
  expect(register.props.group).toMatchObject({ year: "2026", totalKept: 2400 });
  expect(register.props.liveTransferIds).toEqual(new Set([transfer.id]));
});

it("asks whether linked real money stays or moves back on deletion", () => {
  const win = makeCravingWin({
    id: "takeout",
    description: "Takeout",
    amount_kept: 2400,
    date: "2026-08-20",
    occurred_at: "2026-08-20T18:00:00.000Z",
  });
  const linked = CravingDeleteDialog({
    win,
    hasLiveTransfer: true,
    onOpenChange: vi.fn(),
    onDelete: vi.fn(),
  });
  expect(textOf(linked)).toContain("Delete win only");
  expect(textOf(linked)).toContain("Delete and move back");

  const plain = CravingDeleteDialog({
    win,
    hasLiveTransfer: false,
    onOpenChange: vi.fn(),
    onDelete: vi.fn(),
  });
  expect(textOf(plain)).toContain("Delete win");
  expect(textOf(plain)).not.toContain("move back");
});
