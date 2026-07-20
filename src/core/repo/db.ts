import { openDB, type IDBPDatabase } from "idb";

export const DB_NAME = "yaccount";
export const DB_VERSION = 1;

/** Object-store registry. Seven materialized tables (§7) + two infra stores. */
export const STORE = {
  categories: "categories",
  containers: "containers",
  budgetTargets: "budget_targets",
  transactions: "transactions",
  containerSnapshots: "container_snapshots",
  recurringRules: "recurring_rules",
  goals: "goals",
  oplog: "oplog", // append-only journal (§8.2)
  appMeta: "app_meta", // device-local metadata (deviceId, …) — never synced (§8.4)
} as const;

export type StoreName = (typeof STORE)[keyof typeof STORE];

/** The seven persisted materialized tables (§7). */
export const STATE_STORES: StoreName[] = [
  STORE.categories,
  STORE.containers,
  STORE.budgetTargets,
  STORE.transactions,
  STORE.containerSnapshots,
  STORE.recurringRules,
  STORE.goals,
];

/** Every store — the transaction scope for a dispatch (append + apply, §3). */
export const ALL_STORES: StoreName[] = [...STATE_STORES, STORE.oplog, STORE.appMeta];

export const INDEX = {
  // §8.3 — excludes transfers (their category_id is null → IndexedDB drops the record).
  byContainerCategoryMonth: "by_container_category_month",
  // Transfer-inclusive; Container Flows (M5) reads this (impl §M1).
  byContainerMonth: "by_container_month",
  // Total-order iteration of the op-log (ts, then id) — §8.2.
  oplogByTs: "by_ts",
} as const;

export function openDb(name: string = DB_NAME): Promise<IDBPDatabase> {
  return openDB(name, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore(STORE.categories, { keyPath: "id" });
      db.createObjectStore(STORE.containers, { keyPath: "id" });
      db.createObjectStore(STORE.budgetTargets, { keyPath: "id" });

      const transactions = db.createObjectStore(STORE.transactions, { keyPath: "id" });
      transactions.createIndex(INDEX.byContainerCategoryMonth, [
        "container_id",
        "category_id",
        "yearMonth",
      ]);
      transactions.createIndex(INDEX.byContainerMonth, ["container_id", "yearMonth"]);

      db.createObjectStore(STORE.containerSnapshots, { keyPath: "id" });
      db.createObjectStore(STORE.recurringRules, { keyPath: "id" });
      db.createObjectStore(STORE.goals, { keyPath: "id" });

      const oplog = db.createObjectStore(STORE.oplog, { keyPath: "id" });
      oplog.createIndex(INDEX.oplogByTs, ["ts", "id"]);

      db.createObjectStore(STORE.appMeta, { keyPath: "key" });
    },
  });
}
