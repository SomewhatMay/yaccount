import { describe, it, expect } from "vitest";
import {
  activeContainerFilterCount,
  applyContainerFilter,
  isContainerSort,
  matchesContainer,
  sortContainers,
} from "@/features/containers/filter";
import { GENERAL_CONTAINER_ID, makeContainer, type Container } from "@/core/model";

const box = (over: {
  id: string;
  name?: string;
  investment?: boolean;
  counted?: boolean;
  archived?: boolean;
}): Container => ({
  ...makeContainer({
    id: over.id,
    name: over.name ?? over.id,
    is_investment: over.investment ?? false,
    include_in_overall_balance: over.counted ?? false,
  }),
  is_archived: over.archived ?? false,
});

describe("matchesContainer — the containers predicate", () => {
  const wallet = box({ id: "wallet", name: "Wallet", counted: true });
  const broker = box({ id: "broker", name: "Brokerage", investment: true });
  const trip = box({ id: "trip", name: "Japan trip" });
  const gone = box({ id: "gone", name: "Old account", archived: true });
  const all = [wallet, broker, trip, gone];

  it("an empty filter matches everything", () => {
    expect(applyContainerFilter(all, {})).toEqual(all);
    for (const c of all) expect(matchesContainer(c, {})).toBe(true);
  });

  it("narrows on the name, every word in any order", () => {
    expect(applyContainerFilter(all, { text: "japan" }).map((c) => c.id)).toEqual([
      "trip",
    ]);
    expect(applyContainerFilter(all, { text: "TRIP japan" }).map((c) => c.id)).toEqual([
      "trip",
    ]);
  });

  it("narrows on kind, on whether it counts, and on whether it is archived", () => {
    expect(applyContainerFilter(all, { kinds: ["investment"] }).map((c) => c.id)).toEqual(
      ["broker"],
    );
    expect(applyContainerFilter(all, { counted: ["counted"] }).map((c) => c.id)).toEqual([
      "wallet",
    ]);
    expect(
      applyContainerFilter(all, { counted: ["uncounted"] }).map((c) => c.id),
    ).toEqual(["broker", "trip", "gone"]);
    expect(applyContainerFilter(all, { states: ["archived"] }).map((c) => c.id)).toEqual([
      "gone",
    ]);
    expect(applyContainerFilter(all, { states: ["active"] }).map((c) => c.id)).toEqual([
      "wallet",
      "broker",
      "trip",
    ]);
  });

  it("combines facets with AND, and an emptied facet constrains nothing", () => {
    expect(
      applyContainerFilter(all, { kinds: ["plain"], states: ["active"] }).map(
        (c) => c.id,
      ),
    ).toEqual(["wallet", "trip"]);
    expect(applyContainerFilter(all, { kinds: [], counted: [], states: [] })).toEqual(
      all,
    );
  });

  it("counts facets, not values", () => {
    expect(activeContainerFilterCount({})).toBe(0);
    expect(activeContainerFilterCount({ kinds: ["plain", "investment"] })).toBe(1);
    expect(
      activeContainerFilterCount({ text: "a", counted: ["counted"], states: ["active"] }),
    ).toBe(3);
  });
});

describe("sortContainers", () => {
  const general = box({ id: GENERAL_CONTAINER_ID, name: "Zed wallet" });
  const trip = box({ id: "trip", name: "Japan trip" });
  const buffer = box({ id: "buffer", name: "Emergency" });
  const all = [trip, general, buffer];
  const balance = (c: Container) =>
    ({ [GENERAL_CONTAINER_ID]: 5000, trip: 120000, buffer: -200 })[c.id] ?? 0;

  it("only accepts an order this build can render", () => {
    expect(isContainerSort("name")).toBe(true);
    expect(isContainerSort("balance")).toBe(true);
    expect(isContainerSort("size")).toBe(false);
  });

  it("by name, with the default wallet pinned first", () => {
    // 'general' is the wallet everything defaults to; burying it under J for
    // Japan would make the list read as if it weren't special.
    expect(sortContainers(all, "name", { balance }).map((c) => c.id)).toEqual([
      GENERAL_CONTAINER_ID,
      "buffer",
      "trip",
    ]);
  });

  it("by balance, biggest first, signed — a negative balance belongs at the bottom", () => {
    expect(sortContainers(all, "balance", { balance }).map((c) => c.id)).toEqual([
      "trip",
      GENERAL_CONTAINER_ID,
      "buffer",
    ]);
  });

  it("leaves the caller's array alone", () => {
    const input = [...all];
    sortContainers(all, "balance", { balance });
    expect(all).toEqual(input);
  });
});
