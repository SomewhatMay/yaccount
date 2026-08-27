import { openDB, type IDBPDatabase } from "idb";

export const DB_NAME = "yaccount";
// v5: adds reconstructable Ledger read stores/indexes. Canonical stores stay untouched.
export const DB_VERSION = 5;

/** Object-store registry. Materialized tables (§7) + infra stores. */
export const STORE = {
  categories: "categories",
  containers: "containers",
  budgetTargets: "budget_targets",
  transactions: "transactions",
  containerSnapshots: "container_snapshots",
  recurringRules: "recurring_rules",
  goals: "goals",
  cravingWins: "craving_wins",
  entryRead: "entry_read",
  ledgerBalanceBucket: "ledger_balance_bucket",
  ledgerReadFact: "ledger_read_fact",
  settings: "settings", // synced user preferences (M3) — key/value, keyPath 'key'
  oplog: "oplog", // append-only journal (§8.2)
  appMeta: "app_meta", // device-local metadata (deviceId, …) — never synced (§8.4)
  outbox: "outbox", // device-local: op-ids authored here, pending push (M9, §8.4)
} as const;

export type StoreName = (typeof STORE)[keyof typeof STORE];

/** The synced materialized stores, including `settings` (M3). */
export const STATE_STORES: StoreName[] = [
  STORE.categories,
  STORE.containers,
  STORE.budgetTargets,
  STORE.transactions,
  STORE.containerSnapshots,
  STORE.recurringRules,
  STORE.goals,
  STORE.cravingWins,
  STORE.settings,
];

/** Disposable, local read models. Never synced or exported. */
export const READ_STORES: StoreName[] = [
  STORE.entryRead,
  STORE.ledgerBalanceBucket,
  STORE.ledgerReadFact,
];

/** Every store — the transaction scope for a dispatch (append + apply, §3).
 * Includes `outbox` so a local dispatch enqueues its op for push in the SAME
 * atomic transaction (§8.4 — a crash can't leave an authored op un-queued). */
export const ALL_STORES: StoreName[] = [
  ...STATE_STORES,
  ...READ_STORES,
  STORE.oplog,
  STORE.appMeta,
  STORE.outbox,
];

export const INDEX = {
  // §8.3 — excludes transfers (their category_id is null → IndexedDB drops the record).
  byContainerCategoryMonth: "by_container_category_month",
  // Transfer-inclusive; Container Flows (M5) reads this (impl §M1).
  byContainerMonth: "by_container_month",
  // Total-order iteration of the op-log (ts, then id) — §8.2.
  oplogByTs: "by_ts",
  transactionsByDate: "by_date",
  transactionsByReversesId: "by_reverses_id",
  transactionsByCategoryDate: "by_category_date",
  transactionsBySourceDate: "by_source_date",
  transactionsByDestinationDate: "by_destination_date",
  transactionsByRuleDate: "by_rule_date",
  transactionsByOccurrenceDate: "by_occurrence_date",
  entryChronology: "by_chronology",
  entryLargest: "by_largest",
  entrySmallest: "by_smallest",
  entryCategoryChronology: "by_category_chronology",
  entrySourceChronology: "by_source_chronology",
  entryDestinationChronology: "by_destination_chronology",
  entryRuleChronology: "by_rule_chronology",
  entryOccurrenceChronology: "by_occurrence_chronology",
  entryVendorUsage: "by_vendor_usage",
  entryShortcutUsage: "by_shortcut_usage",
  balanceBucketByPeriodContainer: "by_period_container_key",
} as const;

export function openDb(name: string = DB_NAME): Promise<IDBPDatabase> {
  let opened: IDBPDatabase | undefined;
  const pending = openDB(name, DB_VERSION, {
    // Guarded per-store creation so an existing device upgrades in place — an
    // already-populated IndexedDB is the local-first source of truth (§8.6) and
    // must never be dropped to add a store.
    upgrade(db, _oldVersion, _newVersion, upgradeTx) {
      const store = (name: StoreName, keyPath = "id") =>
        db.objectStoreNames.contains(name)
          ? null
          : db.createObjectStore(name, { keyPath });

      const ensureIndex = (
        storeName: StoreName,
        name: string,
        keyPath: string | string[],
      ) => {
        const objectStore = upgradeTx.objectStore(storeName);
        if (!objectStore.indexNames.contains(name))
          objectStore.createIndex(name, keyPath);
      };

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
      ensureIndex(STORE.transactions, INDEX.transactionsByDate, "date");
      ensureIndex(STORE.transactions, INDEX.transactionsByReversesId, "reverses_id");
      ensureIndex(STORE.transactions, INDEX.transactionsByCategoryDate, [
        "category_id",
        "date",
        "entered_at",
        "id",
      ]);
      ensureIndex(STORE.transactions, INDEX.transactionsBySourceDate, [
        "container_id",
        "date",
        "entered_at",
        "id",
      ]);
      ensureIndex(STORE.transactions, INDEX.transactionsByDestinationDate, [
        "to_container_id",
        "date",
        "entered_at",
        "id",
      ]);
      ensureIndex(STORE.transactions, INDEX.transactionsByRuleDate, [
        "recurring_rule_id",
        "date",
        "entered_at",
        "id",
      ]);
      ensureIndex(
        STORE.transactions,
        INDEX.transactionsByOccurrenceDate,
        "recurring_occurrence_date",
      );

      store(STORE.containerSnapshots);
      store(STORE.recurringRules);
      store(STORE.goals);
      store(STORE.cravingWins);
      store(STORE.entryRead);
      ensureIndex(STORE.entryRead, INDEX.entryChronology, [
        "state",
        "date",
        "entered_at",
        "id",
      ]);
      ensureIndex(STORE.entryRead, INDEX.entryLargest, [
        "state",
        "absAmount",
        "date",
        "entered_at",
        "id",
      ]);
      ensureIndex(STORE.entryRead, INDEX.entrySmallest, [
        "state",
        "absAmount",
        "smallestTieKey",
      ]);
      ensureIndex(STORE.entryRead, INDEX.entryCategoryChronology, [
        "state",
        "category_id",
        "date",
        "entered_at",
        "id",
      ]);
      ensureIndex(STORE.entryRead, INDEX.entrySourceChronology, [
        "state",
        "container_id",
        "date",
        "entered_at",
        "id",
      ]);
      ensureIndex(STORE.entryRead, INDEX.entryDestinationChronology, [
        "state",
        "to_container_id",
        "date",
        "entered_at",
        "id",
      ]);
      ensureIndex(STORE.entryRead, INDEX.entryRuleChronology, [
        "state",
        "recurring_rule_id",
        "date",
        "entered_at",
        "id",
      ]);
      ensureIndex(STORE.entryRead, INDEX.entryOccurrenceChronology, [
        "state",
        "recurring_rule_id",
        "recurring_occurrence_date",
        "id",
      ]);
      ensureIndex(STORE.entryRead, INDEX.entryVendorUsage, [
        "state",
        "normalizedVendor",
        "category_id",
        "container_id",
        "date",
        "entered_at",
        "id",
      ]);
      ensureIndex(STORE.entryRead, INDEX.entryShortcutUsage, [
        "state",
        "shortcutShape",
        "date",
        "entered_at",
        "id",
      ]);
      store(STORE.ledgerBalanceBucket);
      ensureIndex(STORE.ledgerBalanceBucket, INDEX.balanceBucketByPeriodContainer, [
        "period",
        "containerId",
        "key",
      ]);
      store(STORE.ledgerReadFact);
      store(STORE.settings, "key"); // added in DB v2 (M3)

      const oplog = store(STORE.oplog);
      if (oplog) oplog.createIndex(INDEX.oplogByTs, ["ts", "id"]);

      store(STORE.appMeta, "key");
      store(STORE.outbox); // added in DB v3 (M9); keyPath 'id' = the op id
    },
    // A newer client (higher DB_VERSION) has our store set already — never a data
    // hazard, but the browser blocks the downgrade-open. Nothing to do here; the
    // guarded upgrade above only ever *adds* stores.
    blocked() {
      /* another tab holds an older connection; the caller remains safely blocked */
    },
    blocking() {
      opened?.close();
    },
  });
  return pending.then((db) => {
    opened = db;
    return db;
  });
}
