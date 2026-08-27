import { expect, test, type Page } from "@playwright/test";

const rowCount = Number(process.env.LEDGER_PERF_ROWS ?? 0);
const WARMUPS = 3;
const SAMPLES = 20;

type Summary = {
  median: number;
  p95: number;
  max: number;
};

function summarize(values: number[]): Summary {
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p: number) =>
    sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
  return {
    median: Number(percentile(0.5).toFixed(1)),
    p95: Number(percentile(0.95).toFixed(1)),
    max: Number(sorted.at(-1)!.toFixed(1)),
  };
}

async function seedWithoutProjection(page: Page, count: number): Promise<number> {
  await page.route("**/perf-seed", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>seed</title>",
    }),
  );
  await page.goto("/perf-seed");
  const usage = await page.evaluate(async (rows) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase("yaccount");
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("yaccount", 5);
      request.onupgradeneeded = () => {
        const database = request.result;
        for (const name of [
          "categories",
          "containers",
          "budget_targets",
          "container_snapshots",
          "recurring_rules",
          "goals",
          "craving_wins",
          "outbox",
        ]) {
          database.createObjectStore(name, { keyPath: "id" });
        }
        const transactions = database.createObjectStore("transactions", {
          keyPath: "id",
        });
        transactions.createIndex("by_container_category_month", [
          "container_id",
          "category_id",
          "yearMonth",
        ]);
        transactions.createIndex("by_container_month", ["container_id", "yearMonth"]);
        transactions.createIndex("by_date", "date");
        transactions.createIndex("by_reverses_id", "reverses_id");
        transactions.createIndex("by_category_date", [
          "category_id",
          "date",
          "entered_at",
          "id",
        ]);
        transactions.createIndex("by_source_date", [
          "container_id",
          "date",
          "entered_at",
          "id",
        ]);
        transactions.createIndex("by_destination_date", [
          "to_container_id",
          "date",
          "entered_at",
          "id",
        ]);
        transactions.createIndex("by_rule_date", [
          "recurring_rule_id",
          "date",
          "entered_at",
          "id",
        ]);
        transactions.createIndex("by_occurrence_date", "recurring_occurrence_date");
        const entries = database.createObjectStore("entry_read", { keyPath: "id" });
        for (const [name, key] of [
          ["by_chronology", ["state", "date", "entered_at", "id"]],
          ["by_largest", ["state", "absAmount", "date", "entered_at", "id"]],
          ["by_smallest", ["state", "absAmount", "smallestTieKey"]],
          [
            "by_category_chronology",
            ["state", "category_id", "date", "entered_at", "id"],
          ],
          ["by_source_chronology", ["state", "container_id", "date", "entered_at", "id"]],
          [
            "by_destination_chronology",
            ["state", "to_container_id", "date", "entered_at", "id"],
          ],
          [
            "by_rule_chronology",
            ["state", "recurring_rule_id", "date", "entered_at", "id"],
          ],
          [
            "by_occurrence_chronology",
            ["state", "recurring_rule_id", "recurring_occurrence_date", "id"],
          ],
          [
            "by_vendor_usage",
            [
              "state",
              "normalizedVendor",
              "category_id",
              "container_id",
              "date",
              "entered_at",
              "id",
            ],
          ],
          ["by_shortcut_usage", ["state", "shortcutShape", "date", "entered_at", "id"]],
        ] as Array<[string, string[]]>) {
          entries.createIndex(name, key);
        }
        const buckets = database.createObjectStore("ledger_balance_bucket", {
          keyPath: "id",
        });
        buckets.createIndex("by_period_container_key", ["period", "containerId", "key"]);
        database.createObjectStore("ledger_read_fact", { keyPath: "id" });
        const oplog = database.createObjectStore("oplog", { keyPath: "id" });
        oplog.createIndex("by_ts", ["ts", "id"]);
        database.createObjectStore("settings", { keyPath: "key" });
        database.createObjectStore("app_meta", { keyPath: "key" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction(["categories", "containers", "transactions"], "readwrite");
    tx.objectStore("categories").put({
      id: "perf-category",
      name: "Performance",
      type: "expense",
      is_archived: false,
      excluded_from_stats: false,
      color: null,
      icon: null,
    });
    tx.objectStore("containers").put({
      id: "general",
      name: "Wallet",
      is_investment: false,
      include_in_overall_balance: true,
      is_archived: false,
    });
    const transactions = tx.objectStore("transactions");
    const reversalSize = 101;
    const ordinaryRows = rows - reversalSize;
    for (let index = 0; index < ordinaryRows; index += 1) {
      const sequence = String(index).padStart(6, "0");
      transactions.put({
        id: `perf-${sequence}`,
        date: "2026-08-27",
        amount: -100 - (index % 100) * 100,
        vendor_source:
          index === ordinaryRows - 1
            ? "Perf early needle"
            : `Perf vendor ${String(index % 100).padStart(3, "0")}`,
        category_id: "perf-category",
        container_id: "general",
        to_container_id: null,
        is_template: false,
        template_name: null,
        inbox_status: "approved",
        recurring_rule_id: null,
        recurring_occurrence_date: null,
        notes: null,
        reverses_id: null,
        entered_at: new Date(Date.UTC(2026, 0, 1) + index * 1_000).toISOString(),
        yearMonth: "2026-08",
      });
    }
    let target = "perf-reversal-000";
    let amount = -12_345;
    for (let index = 0; index < reversalSize; index += 1) {
      const id = `perf-reversal-${String(index).padStart(3, "0")}`;
      transactions.put({
        id,
        date: "2026-08-27",
        amount,
        vendor_source: index === 0 ? "Perf deep needle" : "Perf reversal",
        category_id: "perf-category",
        container_id: "general",
        to_container_id: null,
        is_template: false,
        template_name: null,
        inbox_status: "approved",
        recurring_rule_id: null,
        recurring_occurrence_date: null,
        notes: index === 0 ? "oldest exhaustive search target" : null,
        reverses_id: index === 0 ? null : target,
        entered_at: new Date(Date.UTC(2025, 0, 1) + index * 1_000).toISOString(),
        yearMonth: "2026-08",
      });
      target = id;
      amount = -amount;
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return (await navigator.storage.estimate()).usage ?? 0;
  }, count);
  await page.unroute("**/perf-seed");
  return usage;
}

async function runIndexedDbBenchmarks(page: Page) {
  return page.evaluate(
    async ({ warmups, samples, rows }) => {
      const open = () =>
        new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open("yaccount");
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      const requestValue = <T>(request: IDBRequest<T>) =>
        new Promise<T>((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      const continueCursor = (cursor: IDBCursorWithValue) =>
        new Promise<IDBCursorWithValue | null>((resolve, reject) => {
          const request = cursor.request;
          request.onsuccess = () => resolve(request.result as IDBCursorWithValue | null);
          request.onerror = () => reject(request.error);
          cursor.continue();
        });
      const db = await open();
      const definitions = [
        ["newest", "by_chronology", "prev"],
        ["oldest", "by_chronology", "next"],
        ["largest", "by_largest", "prev"],
        ["smallest", "by_smallest", "next"],
      ] as const;
      const measurePage = async (
        indexName: string,
        direction: IDBCursorDirection,
        start: IDBValidKey | null,
      ) => {
        const tx = db.transaction("entry_read", "readonly");
        const index = tx.objectStore("entry_read").index(indexName);
        const lower: IDBValidKey = ["ledger"];
        const upper: IDBValidKey = ["ledger", []];
        const range = start
          ? direction === "next"
            ? IDBKeyRange.bound(start, upper, true, false)
            : IDBKeyRange.bound(lower, start, false, true)
          : IDBKeyRange.bound(lower, upper);
        let cursor = await requestValue(index.openCursor(range, direction));
        let last: IDBValidKey | null = null;
        let read = 0;
        while (cursor && read < 50) {
          last = cursor.key;
          read += 1;
          cursor = await continueCursor(cursor);
        }
        return { last, read };
      };
      const keyAt = async (
        indexName: string,
        direction: IDBCursorDirection,
        ordinal: number,
      ) => {
        const tx = db.transaction("entry_read", "readonly");
        const index = tx.objectStore("entry_read").index(indexName);
        const cursor = await requestValue(
          index.openCursor(IDBKeyRange.bound(["ledger"], ["ledger", []]), direction),
        );
        if (!cursor) throw new Error("missing deep cursor");
        cursor.advance(ordinal);
        const advanced = await new Promise<IDBCursorWithValue | null>(
          (resolve, reject) => {
            cursor.request.onsuccess = () =>
              resolve(cursor.request.result as IDBCursorWithValue | null);
            cursor.request.onerror = () => reject(cursor.request.error);
          },
        );
        if (!advanced) throw new Error("deep cursor past end");
        return advanced.key;
      };
      const metrics: Record<string, number[]> = {};
      for (const [sort, indexName, direction] of definitions) {
        const first = await measurePage(indexName, direction, null);
        const starts: Array<[string, IDBValidKey | null]> = [
          [`${sort}.first`, null],
          [`${sort}.next`, first.last],
        ];
        if (sort === "largest" || sort === "smallest") {
          starts.push([
            `${sort}.deep`,
            await keyAt(indexName, direction, Math.floor(rows * 0.8)),
          ]);
        }
        for (const [name, start] of starts) {
          const durations: number[] = [];
          for (let sample = 0; sample < warmups + samples; sample += 1) {
            const before = performance.now();
            const result = await measurePage(indexName, direction, start);
            if (result.read === 0) throw new Error(`${name} returned no rows`);
            if (sample >= warmups) durations.push(performance.now() - before);
          }
          metrics[name] = durations;
        }
      }
      const sizes: Record<string, number> = {};
      for (const storeName of [
        "transactions",
        "entry_read",
        "ledger_balance_bucket",
        "ledger_read_fact",
      ]) {
        const tx = db.transaction(storeName, "readonly");
        const store = tx.objectStore(storeName);
        let cursor = await requestValue(store.openCursor());
        let bytes = 0;
        while (cursor) {
          bytes += JSON.stringify(cursor.value).length;
          cursor = await continueCursor(cursor);
        }
        sizes[storeName] = bytes;
      }
      db.close();
      return { metrics, sizes, usage: (await navigator.storage.estimate()).usage ?? 0 };
    },
    { warmups: WARMUPS, samples: SAMPLES, rows: rowCount },
  );
}

test.describe("large Ledger performance", () => {
  test.skip(
    ![50_000, 100_000].includes(rowCount),
    "Set LEDGER_PERF_ROWS=50000 or 100000.",
  );

  test("meets paging, progressive scan, write, and storage gates", async ({ page }) => {
    test.setTimeout(900_000);
    const browser = await page.evaluate(() => navigator.userAgent);
    const usageBefore = await seedWithoutProjection(page, rowCount);
    const buildStarted = performance.now();
    await page.goto("/ledger");
    await expect(page.getByText("Perf early needle", { exact: true })).toBeVisible({
      timeout: 120_000,
    });
    const projectionBuildMs = performance.now() - buildStarted;

    const indexedDb = await runIndexedDbBenchmarks(page);
    const idbMetrics = Object.fromEntries(
      Object.entries(indexedDb.metrics).map(([name, values]) => [
        name,
        summarize(values),
      ]),
    );

    await page.evaluate(() => {
      const target = globalThis as typeof globalThis & {
        __perfGap?: { last: number; max: number; timer: number };
      };
      const now = performance.now();
      target.__perfGap = {
        last: now,
        max: 0,
        timer: window.setInterval(() => {
          const current = performance.now();
          target.__perfGap!.max = Math.max(
            target.__perfGap!.max,
            current - target.__perfGap!.last,
          );
          target.__perfGap!.last = current;
        }, 5),
      };
    });

    const filterEarly: number[] = [];
    const filterExhaustive: number[] = [];
    const ledgerSearch = page.getByRole("textbox", { name: "Search entries" });
    for (let sample = 0; sample < WARMUPS + SAMPLES; sample += 1) {
      let before = performance.now();
      await ledgerSearch.fill("early needle");
      await expect(page.getByText("Perf early needle", { exact: true })).toBeVisible();
      await expect(page.getByText(/^Perf vendor/).first()).toBeHidden();
      if (sample >= WARMUPS) filterEarly.push(performance.now() - before);
      await ledgerSearch.fill("");
      await expect(page.getByText(/^Perf vendor/).first()).toBeVisible();

      before = performance.now();
      await ledgerSearch.fill("deep needle");
      await expect(page.getByText("Perf deep needle", { exact: true })).toBeVisible({
        timeout: 10_000,
      });
      if (sample >= WARMUPS) filterExhaustive.push(performance.now() - before);
      await ledgerSearch.fill("");
      await expect(page.getByText("Perf early needle", { exact: true })).toBeVisible();
    }

    const searchEarly: number[] = [];
    const searchExhaustive: number[] = [];
    for (let sample = 0; sample < WARMUPS + SAMPLES; sample += 1) {
      await page.keyboard.press("ControlOrMeta+k");
      const input = page.getByPlaceholder(/Search everything/);
      let before = performance.now();
      await input.fill("early needle");
      await expect(page.getByRole("option", { name: /Perf early needle/ })).toBeVisible();
      if (sample >= WARMUPS) searchEarly.push(performance.now() - before);
      await input.fill("");

      before = performance.now();
      await input.fill("deep needle");
      await expect(page.getByRole("option", { name: /Perf deep needle/ })).toBeVisible({
        timeout: 10_000,
      });
      if (sample >= WARMUPS) searchExhaustive.push(performance.now() - before);
      await page.keyboard.press("Escape");
      await expect(input).toBeHidden();
    }

    const componentWrites: number[] = [];
    for (let sample = 0; sample < WARMUPS + SAMPLES; sample += 1) {
      const actions = page.getByRole("button", { name: "Actions for Perf deep needle" });
      await actions.click();
      let before = performance.now();
      await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
      await expect(page.getByText("Deleted", { exact: true })).toBeVisible();
      if (sample >= WARMUPS) componentWrites.push(performance.now() - before);

      before = performance.now();
      await page.getByRole("button", { name: "Undo", exact: true }).click();
      await expect(page.getByText("Perf deep needle", { exact: true })).toBeVisible();
      if (sample >= WARMUPS) componentWrites.push(performance.now() - before);
    }

    const maxEventLoopGapMs = await page.evaluate(() => {
      const target = globalThis as typeof globalThis & {
        __perfGap?: { max: number; timer: number };
      };
      const gap = target.__perfGap;
      if (!gap) return 0;
      window.clearInterval(gap.timer);
      return gap.max;
    });
    const canonicalBytes = indexedDb.sizes.transactions;
    const readBytes =
      indexedDb.sizes.entry_read +
      indexedDb.sizes.ledger_balance_bucket +
      indexedDb.sizes.ledger_read_fact;
    const result = {
      rows: rowCount,
      browser,
      cpu: process.env.LEDGER_PERF_CPU ?? "unrecorded",
      projectionBuildMs: Number(projectionBuildMs.toFixed(1)),
      indexedDb: idbMetrics,
      filterEarly: summarize(filterEarly),
      filterExhaustive: summarize(filterExhaustive),
      searchEarly: summarize(searchEarly),
      searchExhaustive: summarize(searchExhaustive),
      componentWrite: summarize(componentWrites),
      maxEventLoopGapMs: Number(maxEventLoopGapMs.toFixed(1)),
      storage: {
        canonicalBytes,
        readBytes,
        serializedRatio: Number((readBytes / canonicalBytes).toFixed(3)),
        browserGrowthBytes: Math.max(0, indexedDb.usage - usageBefore),
        browserGrowthRatio: Number(
          (Math.max(0, indexedDb.usage - usageBefore) / canonicalBytes).toFixed(3),
        ),
      },
    };
    console.log(`LEDGER_PERFORMANCE ${JSON.stringify(result)}`);

    if (rowCount === 50_000) {
      expect(projectionBuildMs).toBeLessThanOrEqual(10_000);
      for (const metric of Object.values(idbMetrics))
        expect(metric.p95).toBeLessThanOrEqual(100);
      expect(result.filterEarly.p95).toBeLessThanOrEqual(150);
      expect(result.filterExhaustive.p95).toBeLessThanOrEqual(2_500);
      expect(result.searchEarly.p95).toBeLessThanOrEqual(150);
      expect(result.searchExhaustive.p95).toBeLessThanOrEqual(2_500);
      expect(result.componentWrite.p95).toBeLessThanOrEqual(150);
      expect(result.maxEventLoopGapMs).toBeLessThanOrEqual(25);
      expect(result.storage.serializedRatio).toBeLessThanOrEqual(2);
      expect(result.storage.browserGrowthRatio).toBeLessThanOrEqual(2);
    }
  });
});
