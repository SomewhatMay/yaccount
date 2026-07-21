import { openDB, type IDBPDatabase } from "idb";

export const DB_NAME = "yaccount";
export const DB_VERSION = 2;

/** Object-store registry. Seven materialized tables (§7) + two infra stores. */
export const STORE = {
  categories: "categories",
  containers: "containers",
  budgetTargets: "budget_targets",
  transactions: "transactions",
  containerSnapshots: "container_snapshots",
  recurringRules: "recurring_rules",
  goals: "goals",
  settings: "settings", // synced user preferences (M3) — key/value, keyPath 'key'
  oplog: "oplog", // append-only journal (§8.2)
  appMeta: "app_meta", // device-local metadata (deviceId, …) — never synced (§8.4)
} as const;

export type StoreName = (typeof STORE)[keyof typeof STORE];

/** The synced materialized stores: the seven tables (§7) + `settings` (M3). */
export const STATE_STORES: StoreName[] = [
  STORE.categories,
  STORE.containers,
  STORE.budgetTargets,
  STORE.transactions,
  STORE.containerSnapshots,
  STORE.recurringRules,
  STORE.goals,
  STORE.settings,
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
    // Guarded per-store creation so an existing device upgrades in place — an
    // already-populated IndexedDB is the local-first source of truth (§8.6) and
    // must never be dropped to add a store.
    upgrade(db) {
      const store = (name: StoreName, keyPath = "id") =>
        db.objectStoreNames.contains(name)
          ? null
          : db.createObjectStore(name, { keyPath });

      store(STORE.categories);
      store(STORE.containers);
      store(STORE.budgetTargets);

      const transactions = store(STORE.transactions);
      if (transactions) {
        transactions.createIndex(INDEX.byContainerCategoryMonth, [
          "container_id",
          "category_id",
          "yearMonth",
        ]);
        transactions.createIndex(INDEX.byContainerMonth, ["container_id", "yearMonth"]);
      }

      store(STORE.containerSnapshots);
      store(STORE.recurringRules);
      store(STORE.goals);
      store(STORE.settings, "key"); // added in DB v2 (M3)

      const oplog = store(STORE.oplog);
      if (oplog) oplog.createIndex(INDEX.oplogByTs, ["ts", "id"]);

      store(STORE.appMeta, "key");
    },
  });
}
