import { beforeEach, describe, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { createStore } from "jotai";
import { readFileSync } from "node:fs";
import { makeTemplate, makeTransaction } from "@/core/model";
import type { Op } from "@/core/oplog";
import { Repo } from "@/core/repo";
import { STORE } from "@/core/repo/db";
import {
  containerFactsAtom,
  ledgerCountAtom,
  ledgerRevisionAtom,
  pendingEntriesAtom,
  refreshAtom,
  templatesAtom,
  usageFactsAtom,
} from "./store";

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe("store paging bootstrap", () => {
  it("has no count-proportional transaction atom", () => {
    expect(readFileSync(new URL("./store.ts", import.meta.url), "utf8")).not.toContain(
      "transactionsAtom",
    );
  });

  it("loads compact facts and non-Ledger collections without canonical getAll", async () => {
    const seed = await Repo.open();
    const approved = makeTransaction({
      id: "approved",
      date: "2026-08-20",
      amount: -500,
      vendor_source: "Coffee",
      category_id: "food",
    });
    const pending = { ...approved, id: "pending", inbox_status: "pending" as const };
    const template = makeTemplate({
      id: "template",
      template_name: "Coffee",
      amount: -500,
      vendor_source: "Coffee",
      category_id: "food",
      container_id: "general",
    });
    const ops: Op[] = [approved, pending, template].map((row, index) => ({
      id: `op-${row.id}`,
      ts: new Date(index).toISOString(),
      type: row.is_template ? "template.create" : "transaction.create",
      payload: { row },
    })) as Op[];
    await seed.resetTo(ops);
    seed.close();
    const getAll = vi.spyOn(IDBObjectStore.prototype, "getAll");
    const state = createStore();

    await state.set(refreshAtom);

    expect(
      getAll.mock.instances.filter(
        (store) => (store as IDBObjectStore).name === STORE.transactions,
      ),
    ).toEqual([]);
    expect(state.get(pendingEntriesAtom).map((row) => row.id)).toEqual(["pending"]);
    expect(state.get(templatesAtom).map((row) => row.id)).toEqual(["template"]);
    expect(state.get(ledgerCountAtom)).toBe(1);
    expect(state.get(containerFactsAtom).get("general")?.balance).toBe(-500);
    expect(state.get(usageFactsAtom).length).toBeGreaterThan(0);
    expect(state.get(ledgerRevisionAtom)).toBeGreaterThan(0);
    getAll.mockRestore();
  });
});
