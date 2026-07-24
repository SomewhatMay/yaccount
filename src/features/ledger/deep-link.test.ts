import { describe, it, expect } from "vitest";
import { ledgerHref, parseLedgerQuery } from "./deep-link";
import { NO_FILTER } from "@/features/filter-draft";

describe("ledgerHref — a dashboard drill-down as a real URL", () => {
  it("filters by one category over the widget's window", () => {
    expect(
      ledgerHref({
        categoryIds: ["groc"],
        range: { start: "2026-04-22", end: "2026-07-22" },
      }),
    ).toBe("/ledger?category=groc&from=2026-04-22&to=2026-07-22");
  });

  it("drops the dates when the window is unbounded (all time)", () => {
    expect(ledgerHref({ categoryIds: ["groc"], range: { start: null, end: null } })).toBe(
      "/ledger?category=groc",
    );
  });

  it("searches for a payee, encoding what needs it", () => {
    expect(ledgerHref({ text: "Blue Bottle" })).toBe("/ledger?q=Blue+Bottle");
  });

  it("focuses one entry, carrying no filter", () => {
    expect(ledgerHref({ focus: "tx-1" })).toBe("/ledger?focus=tx-1");
  });

  it("is just the ledger when there is nothing to say", () => {
    expect(ledgerHref({})).toBe("/ledger");
    expect(ledgerHref({ categoryIds: [], range: { start: null, end: null } })).toBe(
      "/ledger",
    );
  });

  it("joins multiple ids and round-trips through the parser", () => {
    const href = ledgerHref({ categoryIds: ["a", "b"], containerIds: ["w"] });
    expect(href).toBe("/ledger?category=a%2Cb&wallet=w");
    const q = href.slice(href.indexOf("?"));
    expect(parseLedgerQuery(q).draft.categoryIds).toEqual(["a", "b"]);
    expect(parseLedgerQuery(q).draft.containerIds).toEqual(["w"]);
  });
});

describe("parseLedgerQuery — arriving on the ledger from a link", () => {
  it("reads a category-and-window link into a filter draft", () => {
    const { draft, focus } = parseLedgerQuery(
      "?category=groc&from=2026-04-22&to=2026-07-22",
    );
    expect(draft.categoryIds).toEqual(["groc"]);
    expect(draft.dates).toEqual({ from: "2026-04-22", to: "2026-07-22" });
    expect(focus).toBeNull();
  });

  it("reads a payee search", () => {
    expect(parseLedgerQuery("?q=Blue+Bottle").draft.text).toBe("Blue Bottle");
  });

  it("reads a focus target with no filter", () => {
    const { draft, focus } = parseLedgerQuery("?focus=tx-9");
    expect(focus).toBe("tx-9");
    expect(draft).toEqual(NO_FILTER);
  });

  it("keeps only the transaction kinds this build knows", () => {
    // A stray or renamed kind must not put the rail in a state it can't render.
    expect(parseLedgerQuery("?type=expense,laundered,income").draft.kinds).toEqual([
      "expense",
      "income",
    ]);
    expect(parseLedgerQuery("?type=nonsense").draft.kinds).toEqual([]);
  });

  it("ignores a from/to that is not a real calendar date", () => {
    const { draft } = parseLedgerQuery("?from=2026-13-40&to=not-a-date");
    expect(draft.dates).toEqual({ from: "", to: "" });
  });

  it("is the empty draft for a bare ledger URL", () => {
    expect(parseLedgerQuery("")).toEqual({ draft: NO_FILTER, focus: null });
    expect(parseLedgerQuery("?")).toEqual({ draft: NO_FILTER, focus: null });
  });

  it("drops empty members of a comma list", () => {
    expect(parseLedgerQuery("?category=a,,b,").draft.categoryIds).toEqual(["a", "b"]);
  });
});
