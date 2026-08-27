import { describe, expect, it } from "vitest";
import { makeTransaction } from "@/core/model";
import {
  initialLedgerPagingState,
  ledgerPagingReducer,
  pageSizeForWidth,
} from "./paging-state";

const row = (id: string) =>
  makeTransaction({
    id,
    date: "2026-08-20",
    amount: -100,
    vendor_source: id,
    category_id: "food",
  });

describe("Ledger paging session state", () => {
  it("uses 25 rows on phone and 50 on larger screens", () => {
    expect(pageSizeForWidth(390)).toBe(25);
    expect(pageSizeForWidth(639)).toBe(25);
    expect(pageSizeForWidth(640)).toBe(50);
    expect(pageSizeForWidth(1280)).toBe(50);
  });

  it("appends same-size pages and deduplicates mutation overlap", () => {
    const initial = initialLedgerPagingState(25);
    const first = ledgerPagingReducer(initial, {
      type: "page",
      rows: [row("a"), row("b")],
      cursor: "one",
      revision: 1,
      complete: false,
      append: false,
    });
    const second = ledgerPagingReducer(first, {
      type: "page",
      rows: [row("b"), row("c")],
      cursor: null,
      revision: 2,
      complete: true,
      append: true,
    });

    expect(second.rows.map((entry) => entry.id)).toEqual(["a", "b", "c"]);
    expect(second.complete).toBe(true);
  });

  it("resets top for sort/filter changes and local add", () => {
    const loaded = {
      ...initialLedgerPagingState(25),
      rows: [row("a")],
      cursor: "one",
      revision: 1,
      complete: false,
    };

    expect(ledgerPagingReducer(loaded, { type: "query-change" })).toMatchObject({
      rows: [],
      cursor: null,
      status: "loading",
    });
    expect(
      ledgerPagingReducer(loaded, { type: "local-add", id: "new" }),
    ).toMatchObject({ rows: [], cursor: null, flashId: "new", status: "loading" });
  });

  it("preserves loaded rows and exposes remote entries until jump", () => {
    const loaded = {
      ...initialLedgerPagingState(25),
      rows: [row("a")],
      revision: 1,
    };
    const changed = ledgerPagingReducer(loaded, {
      type: "remote-change",
      revision: 2,
      hasNewEntries: true,
    });
    expect(changed.rows.map((entry) => entry.id)).toEqual(["a"]);
    expect(changed.newEntries).toBe(true);
    expect(ledgerPagingReducer(changed, { type: "jump-new" })).toMatchObject({
      rows: [],
      newEntries: false,
      status: "loading",
    });
  });

  it("revalidates edited/deleted visible rows without resetting the window", () => {
    const loaded = {
      ...initialLedgerPagingState(25),
      rows: [row("a"), row("b")],
      revision: 1,
    };
    const updated = { ...row("a"), vendor_source: "Updated" };

    const next = ledgerPagingReducer(loaded, {
      type: "revalidate",
      rows: [updated],
      revision: 2,
    });

    expect(next.rows).toEqual([updated]);
    expect(next.revision).toBe(2);
  });

  it("publishes provisional matches without claiming completion", () => {
    const provisional = ledgerPagingReducer(initialLedgerPagingState(25), {
      type: "provisional",
      rows: [row("early")],
      cursor: "scan-one",
      revision: 1,
      append: false,
    });

    expect(provisional.rows.map((entry) => entry.id)).toEqual(["early"]);
    expect(provisional).toMatchObject({
      cursor: "scan-one",
      complete: false,
      status: "loading",
    });
  });
});
