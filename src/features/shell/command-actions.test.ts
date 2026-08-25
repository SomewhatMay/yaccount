import { describe, expect, it } from "vitest";
import { makeContainer } from "@/core/model";
import { buildInvestmentValueActions } from "@/features/shell/command-actions";

describe("buildInvestmentValueActions", () => {
  it("offers one stable action for each active investment only", () => {
    const cash = makeContainer({ id: "cash", name: "Cash" });
    const brokerage = makeContainer({
      id: "brokerage",
      name: "Brokerage",
      is_investment: true,
    });
    const archived = {
      ...makeContainer({
        id: "old-ira",
        name: "Old IRA",
        is_investment: true,
      }),
      is_archived: true,
    };

    expect(buildInvestmentValueActions([cash, brokerage, archived])).toEqual([
      {
        id: "act:investment:brokerage",
        title: "Record investment value",
        subtitle: "Brokerage",
        containerId: "brokerage",
      },
    ]);
  });

  it("preserves container order without mutating the source list", () => {
    const zed = makeContainer({
      id: "zed",
      name: "Zed fund",
      is_investment: true,
    });
    const alpha = makeContainer({
      id: "alpha",
      name: "Alpha fund",
      is_investment: true,
    });
    const containers = [zed, alpha];

    expect(
      buildInvestmentValueActions(containers).map((action) => action.containerId),
    ).toEqual(["zed", "alpha"]);
    expect(containers).toEqual([zed, alpha]);
  });
});
