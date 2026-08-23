import { beforeEach, describe, expect, it, vi } from "vitest";
import { SETTING } from "@/core/model";
import { DASHBOARD_WIDGETS } from "./registry";
import {
  defaultDashboardLayout,
  encodeDashboardLayout,
  type DashboardLayout,
} from "./dashboard-layout";
import { useDashboardLayout } from "./use-dashboard-layout";

const fixture = vi.hoisted(() => ({
  settings: [] as { key: string; value: string }[],
  localRaw: "",
  localWrite: vi.fn(),
  dispatch: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useMemo: <T>(factory: () => T) => factory(),
    useCallback: <T extends (...args: never[]) => unknown>(callback: T) => callback,
  };
});

vi.mock("jotai", () => ({
  useAtomValue: () => fixture.settings,
  useSetAtom: () => fixture.dispatch,
}));

vi.mock("@/features/store", () => ({
  settingsAtom: "settings",
  dispatchAtom: "dispatch",
}));

vi.mock("@/features/prefs", () => ({
  useLocalPref: () => [fixture.localRaw, fixture.localWrite],
}));

const fallback = defaultDashboardLayout(DASHBOARD_WIDGETS);

function moveRecentBeforePace(layout: DashboardLayout): DashboardLayout {
  return {
    ...layout,
    order: [
      "balance",
      "recent",
      "pace",
      ...layout.order.filter((id) => !["balance", "recent", "pace"].includes(id)),
    ],
  };
}

describe("useDashboardLayout", () => {
  beforeEach(() => {
    fixture.settings = [];
    fixture.localRaw = encodeDashboardLayout(fallback);
    fixture.localWrite.mockReset();
    fixture.dispatch.mockReset().mockResolvedValue(undefined);
  });

  it("reads the synced layout when one exists", () => {
    const synced = moveRecentBeforePace(fallback);
    fixture.settings = [
      { key: SETTING.dashboardLayout, value: encodeDashboardLayout(synced) },
    ];

    const [layout] = useDashboardLayout();

    expect(layout).toEqual(synced);
  });

  it("uses the browser layout until a synced layout exists", () => {
    const local = moveRecentBeforePace(fallback);
    fixture.localRaw = encodeDashboardLayout(local);

    const [layout] = useDashboardLayout();

    expect(layout).toEqual(local);
  });

  it("writes the complete layout as one synced setting", async () => {
    const next = moveRecentBeforePace(fallback);

    const [, setLayout] = useDashboardLayout();
    await setLayout(next);

    expect(fixture.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "setting.set",
        payload: {
          row: {
            key: SETTING.dashboardLayout,
            value: encodeDashboardLayout(next),
          },
        },
      }),
    );
    expect(fixture.localWrite).not.toHaveBeenCalled();
  });
});
