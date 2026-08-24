import { expect, it, vi } from "vitest";
import { makeContainer, makeContainerSnapshot } from "@/core/model";
import { LogBalanceSheet } from "@/features/containers/LogBalanceSheet";
import { ReportedBalanceSheet } from "@/features/containers/ReportedBalanceSheet";

const fixture = vi.hoisted(() => ({
  values: new Map<string, unknown>(),
  setters: new Map<string, ReturnType<typeof vi.fn>>(),
}));

vi.mock("jotai", () => ({
  useAtomValue: (atom: string) => fixture.values.get(atom),
  useSetAtom: (atom: string) => fixture.setters.get(atom),
}));

vi.mock("@/features/store", () => ({
  containersAtom: "containers",
  snapshotsAtom: "snapshots",
  dispatchAtom: "dispatch",
  reportedBalanceContainerIdAtom: "reportedBalanceContainer",
}));

it("adapts the selected live container to the existing balance sheet", () => {
  const brokerage = makeContainer({
    id: "brokerage",
    name: "Brokerage",
    is_investment: true,
  });
  const snapshot = makeContainerSnapshot({
    id: "snapshot",
    container_id: brokerage.id,
    date: "2026-08-24",
    reported_balance: 12345,
  });
  const dispatch = vi.fn();
  const setSelected = vi.fn();
  fixture.values.set("reportedBalanceContainer", brokerage.id);
  fixture.values.set("containers", [brokerage]);
  fixture.values.set("snapshots", [snapshot]);
  fixture.setters.set("dispatch", dispatch);
  fixture.setters.set("reportedBalanceContainer", setSelected);

  const sheet = ReportedBalanceSheet();

  expect(sheet.type).toBe(LogBalanceSheet);
  expect(sheet.props.container).toBe(brokerage);
  expect(sheet.props.snapshots).toEqual([snapshot]);
  expect(sheet.props.onDispatch).toBe(dispatch);

  sheet.props.onOpenChange(true);
  expect(setSelected).not.toHaveBeenCalled();
  sheet.props.onOpenChange(false);
  expect(setSelected).toHaveBeenCalledWith(null);
});

it("stays closed when a stale selected id is absent", () => {
  fixture.values.set("reportedBalanceContainer", "missing");
  fixture.values.set("containers", []);
  fixture.values.set("snapshots", []);
  fixture.setters.set("dispatch", vi.fn());
  fixture.setters.set("reportedBalanceContainer", vi.fn());

  expect(ReportedBalanceSheet().props.container).toBeNull();
});
