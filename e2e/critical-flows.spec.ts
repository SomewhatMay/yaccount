import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

/**
 * How long a FAB press is held to get past the hold threshold.
 *
 * The app arms a `FAB_HOLD_MS` (500ms) timer on press and CANCELS it on
 * release, so a hold that beats the timer by only a hair is a coin flip: under
 * full-parallel CPU contention the timer fires late, the release cancels it,
 * and the chooser never opens. The old 550 left 50ms — not enough. Keep a wide
 * margin here rather than trimming the worker count.
 */
const FAB_HOLD_PAST_THRESHOLD_MS = 800;

async function openReady(page: Page, path: string, marker: string | RegExp) {
  await page.goto(path);
  await expect(page.getByText(marker, { exact: true }).first()).toBeVisible();
}

async function choose(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function swipeUp(page: Page, target: Locator) {
  const box = await target.boundingBox();
  if (!box) throw new Error("Touch target is not visible.");

  const session = await page.context().newCDPSession(page);
  const x = box.x + box.width / 2;
  let y = box.y + Math.min(box.height - 30, 400);

  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  for (let i = 0; i < 8; i++) {
    y -= 25;
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y }],
    });
  }
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await session.detach();
}

async function dragUpByTouch(page: Page, target: Locator, distance: number) {
  const box = await target.boundingBox();
  if (!box) throw new Error("Drag handle is not visible.");

  const session = await page.context().newCDPSession(page);
  const x = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y: startY }],
  });
  for (let step = 1; step <= 6; step++) {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y: startY - (distance * step) / 6 }],
    });
  }
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await session.detach();
}

async function createCategory(
  page: Page,
  name: string,
  direction: "Expense" | "Income" = "Expense",
) {
  await openReady(page, "/categories", "What your money does");
  await page.getByRole("button", { name: "New", exact: true }).click();
  await expect(page.getByRole("heading", { name: "New category" })).toBeVisible();
  await page.getByLabel("Name").fill(name);
  await page.getByRole("radio", { name: direction }).click();
  await page.getByRole("button", { name: "Create category" }).click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
}

async function createContainer(page: Page, name: string) {
  await openReady(page, "/containers", "Where your money lives");
  await page.getByRole("button", { name: "New", exact: true }).click();
  await expect(page.getByRole("heading", { name: "New container" })).toBeVisible();
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Create container" }).click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
}

async function openQuickAdd(page: Page) {
  const fab = page.getByRole("button", { name: "Log a transaction" });
  await fab.focus();
  await fab.press("Enter");
  await expect(page.getByRole("heading", { name: "Add an entry" })).toBeVisible();
}

async function logExpense(page: Page, payee: string, amount: string, category: string) {
  await openQuickAdd(page);
  await expect(page.getByLabel("Vendor")).toBeVisible();
  await page.getByLabel("Amount").fill(amount);
  await page.getByLabel("Vendor").fill(payee);
  await choose(page, "Category", category);
  await page.getByRole("button", { name: "Log expense" }).click();
  await expect(page.getByRole("heading", { name: "Add an entry" })).toBeHidden();
}

test.beforeEach(async ({ context }) => {
  // Every test gets a fresh context: no IndexedDB, localStorage, cookies, auth,
  // Drive profile, or ordering dependency can leak from another test.
  await context.addInitScript(() => {
    if (sessionStorage.getItem("yaccount.e2e.storage-cleared")) return;
    localStorage.clear();
    sessionStorage.setItem("yaccount.e2e.storage-cleared", "true");
  });
});

test("opens Ledger on the first immediate tab tap", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Touch regression.");

  await page.goto("/");
  await page.getByRole("link", { name: "Ledger" }).tap();
  await expect(page).toHaveURL(/\/ledger\/?$/);
});

test("opens search from the mobile topbar", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Mobile topbar regression.");

  await openReady(page, "/", "How the money moved");
  const search = page.getByRole("button", { name: "Search yaccount" });
  await expect(search).toBeVisible();
  await search.click();
  await expect(page.getByPlaceholder(/Search everything/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByPlaceholder(/Search everything/)).toBeHidden();
});

test("shows Goals in mobile tabs and Inbox in the topbar", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Mobile navigation regression.");

  await openReady(page, "/", "How the money moved");
  const primary = page.getByRole("navigation", { name: "Primary" });
  await expect(primary.getByRole("link", { name: "Goals" })).toBeVisible();
  await expect(primary.getByRole("link", { name: "Inbox" })).toHaveCount(0);

  await primary.getByRole("link", { name: "Goals" }).tap();
  await expect(page).toHaveURL(/\/goals\/?$/);
  await page.getByRole("link", { name: "Inbox" }).tap();
  await expect(page).toHaveURL(/\/inbox\/?$/);
});

test("commits once for a keyboard resize burst and ignores viewport scroll", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Mobile viewport regression.");

  await context.addInitScript(() => {
    const fake = Object.assign(new EventTarget(), {
      height: window.innerHeight,
      offsetTop: 0,
      width: window.innerWidth,
      pageLeft: 0,
      pageTop: 0,
      scale: 1,
    });
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: fake,
    });
  });

  await openReady(page, "/", "How the money moved");
  await page.evaluate(() => {
    const viewport = window.visualViewport as VisualViewport & {
      height: number;
    };
    viewport.height = 616;
  });
  await openQuickAdd(page);
  const sheet = page.locator('[data-slot="sheet-content"][data-side="bottom"]');
  await expect(sheet).toBeVisible();
  await page.waitForTimeout(100);

  await sheet.evaluate((node) => {
    node.setAttribute("data-test-style-commits", "0");
    node.setAttribute("data-test-style-snapshots", "[]");
    const observer = new MutationObserver(() => {
      const count = Number(node.getAttribute("data-test-style-commits") ?? "0");
      node.setAttribute("data-test-style-commits", String(count + 1));
      const snapshots = JSON.parse(
        node.getAttribute("data-test-style-snapshots") ?? "[]",
      ) as string[];
      snapshots.push(node.getAttribute("style") ?? "");
      node.setAttribute("data-test-style-snapshots", JSON.stringify(snapshots));
    });
    observer.observe(node, { attributes: true, attributeFilter: ["style"] });
  });

  await page.evaluate(async () => {
    const viewport = window.visualViewport as VisualViewport & {
      height: number;
      offsetTop: number;
    };
    const samples = [
      { height: 616, offsetTop: 0 },
      { height: 592, offsetTop: 0 },
      { height: 572, offsetTop: 0 },
      { height: 352, offsetTop: 196.66 },
    ];

    for (const sample of samples) {
      viewport.height = sample.height;
      viewport.offsetTop = sample.offsetTop;
      viewport.dispatchEvent(new Event("resize"));
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
  });
  await page.waitForTimeout(100);

  const commitsAfterResize = Number(await sheet.getAttribute("data-test-style-commits"));
  const snapshotsAfterResize =
    (await sheet.getAttribute("data-test-style-snapshots")) ?? "[]";
  expect(
    commitsAfterResize,
    `style snapshots: ${snapshotsAfterResize}`,
  ).toBeLessThanOrEqual(1);
  expect(
    await sheet.evaluate((node) => ({
      inset: node.style.getPropertyValue("--kb"),
      translate: node.style.translate,
    })),
  ).toEqual({ inset: "264px", translate: "0px -67px" });
  const layout = await sheet.evaluate((node) => {
    const viewportProbe = document.createElement("div");
    viewportProbe.style.cssText =
      "position:fixed;height:100svh;visibility:hidden;pointer-events:none";
    document.body.append(viewportProbe);
    const smallViewportHeight = Number.parseFloat(getComputedStyle(viewportProbe).height);
    viewportProbe.remove();

    const style = getComputedStyle(node);
    return {
      expectedMaxHeight: smallViewportHeight - 264,
      extensionHeight: getComputedStyle(node, "::after").height,
      maxHeight: Number.parseFloat(style.maxHeight),
      overflow: style.overflow,
    };
  });
  expect(layout.maxHeight, JSON.stringify(layout)).toBeCloseTo(
    layout.expectedMaxHeight,
    1,
  );
  expect(layout.extensionHeight).toBe("67px");
  expect(layout.overflow).toBe("visible");

  await page.evaluate(() => {
    const viewport = window.visualViewport as VisualViewport & {
      offsetTop: number;
    };
    viewport.offsetTop = 220;
    viewport.dispatchEvent(new Event("scroll"));
  });
  await page.waitForTimeout(100);

  await expect(sheet).toHaveAttribute(
    "data-test-style-commits",
    String(commitsAfterResize),
  );
});

test("scrolls the Quick Add heading with its fields", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Mobile sheet regression.");

  await openReady(page, "/", "How the money moved");
  await openQuickAdd(page);

  const body = page.locator('[data-slot="sheet-body"]');
  await expect(body.getByRole("heading", { name: "Add an entry" })).toBeVisible();
  await expect(
    body.getByText("Log an expense, income, or a move between containers."),
  ).toBeVisible();
  await expect(body.getByLabel("Amount")).toBeVisible();
});

test("edits dashboard cards in place and commits on Done", async ({ page }) => {
  await openReady(page, "/", "How the money moved");
  await page.getByRole("button", { name: "Edit dashboard" }).click();
  await expect(
    page.getByRole("heading", { name: "Arrange your dashboard" }),
  ).toBeVisible();

  const rows = page.locator("[data-widget-id]");
  await expect(rows.first()).toHaveAttribute("data-widget-id", "balance");
  await expect(page.getByText("Pinned", { exact: true })).toBeVisible();

  await page
    .getByRole("button", { name: "Move Recent entries without dragging" })
    .click();
  await page.getByRole("menuitem", { name: "Before Budget pace" }).click();
  await expect(rows.nth(1)).toHaveAttribute("data-widget-id", "recent");

  await page.getByRole("button", { name: "Hide Budget pace" }).click();
  await expect(page.locator('[data-widget-id="pace"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("heading", { name: "How the money moved" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Budget pace" })).toBeVisible();

  await page.getByRole("button", { name: "Edit dashboard" }).click();
  await page
    .getByRole("button", { name: "Move Recent entries without dragging" })
    .click();
  await page.getByRole("menuitem", { name: "Before Budget pace" }).click();
  await page.getByRole("button", { name: "Hide Budget pace" }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("heading", { name: "Budget pace" })).toBeHidden();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Budget pace" })).toBeHidden();
  await page.getByRole("button", { name: "Compare with another period" }).click();
  await expect(page.getByRole("heading", { name: "Recent entries" })).toHaveCount(2);
  await expect(page.getByRole("heading", { name: "Budget pace" })).toHaveCount(0);
  await page.getByRole("button", { name: "Compare with another period" }).click();

  await page.getByRole("button", { name: "Edit dashboard" }).click();
  await expect(rows.nth(1)).toHaveAttribute("data-widget-id", "recent");
  await page.getByRole("button", { name: "Reset" }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.locator("h3").first()).toHaveText("Budget pace");
});

test("restores hidden widgets from a descriptive gallery", async ({ page }) => {
  await openReady(page, "/", "How the money moved");
  await page.getByRole("button", { name: "Edit dashboard" }).click();
  await page.getByRole("button", { name: "Hide Budget pace" }).click();
  await page.getByRole("button", { name: "Add widgets" }).click();

  await expect(page.getByRole("heading", { name: "Add widgets" })).toBeVisible();
  await expect(
    page.getByText("Spending against allowances as this month unfolds."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add Budget pace" }).click();
  await page.keyboard.press("Escape");

  await expect(page.locator('[data-widget-id="pace"]')).toBeVisible();
});

test("reorders dashboard widgets by touch", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Touch regression.");

  await openReady(page, "/", "How the money moved");
  await page.getByRole("button", { name: "Edit dashboard" }).tap();
  const recentHandle = page.getByRole("button", {
    name: "Move Recent entries",
    exact: true,
  });
  const recentBox = await recentHandle.boundingBox();
  const paceBox = await page.locator('[data-widget-id="pace"]').boundingBox();
  if (!recentBox || !paceBox) throw new Error("Dashboard cards are not visible.");
  await dragUpByTouch(
    page,
    recentHandle,
    recentBox.y + recentBox.height / 2 - (paceBox.y + paceBox.height / 2),
  );
  await expect(page.locator("[data-widget-id]").nth(1)).toHaveAttribute(
    "data-widget-id",
    "recent",
  );
});

test("logs an expense and shows it in the ledger", async ({ page }) => {
  await createCategory(page, "E2E groceries");
  await openReady(page, "/ledger", "Overall balance");
  await logExpense(page, "E2E market", "12.34", "E2E groceries");

  await expect(page.getByText("E2E market", { exact: true })).toBeVisible();
  await expect(page.getByText("-$12.34", { exact: true }).last()).toBeVisible();
});

test("hides a category expense from dashboard statistics", async ({ page }) => {
  await createCategory(page, "E2E hidden stats");
  await openReady(page, "/ledger", "Overall balance");
  await logExpense(page, "E2E hidden expense", "12.34", "E2E hidden stats");

  await openReady(page, "/", "How the money moved");
  const out = page.getByText("Out", { exact: true }).locator("..");
  await expect(out.getByText("$12.34", { exact: true })).toBeVisible();

  await openReady(page, "/categories", "What your money does");
  const actions = page.getByRole("button", { name: "Actions for E2E hidden stats" });
  await actions.click();
  await page.getByRole("menuitem", { name: "Hide from stats" }).click();
  await expect(page.getByText("Hidden from stats", { exact: true })).toBeVisible();
  await actions.click();
  await expect(page.getByRole("menuitem", { name: "Show in stats" })).toBeVisible();
  await page.keyboard.press("Escape");

  await openReady(page, "/", "How the money moved");
  await expect(out.getByText("$0.00", { exact: true })).toBeVisible();
});

test("scrolls from a row menu trigger and opens it on tap", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Touch regression.");

  await createCategory(page, "E2E row menu category");
  await openReady(page, "/ledger", "Overall balance");
  for (let i = 1; i <= 12; i++) {
    await logExpense(page, `E2E row menu ${i}`, "1.00", "E2E row menu category");
  }

  expect(
    await page.evaluate(() => document.documentElement.scrollHeight),
  ).toBeGreaterThan(await page.evaluate(() => window.innerHeight));

  const trigger = page.getByRole("button", { name: "Actions for E2E row menu 12" });
  const initialScrollY = await page.evaluate(() => window.scrollY);
  await dragUpByTouch(page, trigger, 200);

  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(initialScrollY);
  await expect(page.getByRole("menu")).toBeHidden();

  await trigger.scrollIntoViewIfNeeded();
  await trigger.tap();
  await expect(page.getByRole("menu")).toBeVisible();
});

test("overflowing selects scroll by touch in sheets and pages", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Touch regression.");

  for (let i = 1; i <= 18; i++) {
    await createCategory(page, `E2E scroll category ${String(i).padStart(2, "0")}`);
  }
  const last = "E2E scroll category 18";

  await openReady(page, "/ledger", "Overall balance");
  await openQuickAdd(page);
  await page.getByRole("combobox", { name: "Category" }).tap();
  let viewport = page.locator("[data-radix-select-viewport]");
  await swipeUp(page, viewport);
  await expect.poll(() => viewport.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  await page.getByRole("option", { name: last, exact: true }).tap();
  await expect(page.getByRole("combobox", { name: "Category" })).toHaveText(last);

  await openReady(page, "/", "How the money moved");
  await page.getByText("Pick a category", { exact: true }).tap();
  viewport = page.locator("[data-radix-select-viewport]");
  await swipeUp(page, viewport);
  await expect.poll(() => viewport.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  await page.getByRole("option", { name: last, exact: true }).tap();
  await expect(page.getByRole("combobox").filter({ hasText: last })).toBeVisible();
});

test("moves money between containers", async ({ page }) => {
  await createContainer(page, "E2E savings");
  await openReady(page, "/ledger", "Overall balance");
  await openQuickAdd(page);
  await page.getByRole("radio", { name: "Transfer" }).click();
  await page.getByLabel("Amount").fill("25.00");
  await page.getByLabel("Transfer label").fill("E2E move");
  await choose(page, "From container", "General");
  await choose(page, "To container", "E2E savings");
  await page.getByRole("button", { name: "Move money" }).click();

  await expect(page.getByText("E2E move", { exact: true })).toBeVisible();
  await expect(page.getByText("$25.00", { exact: true })).toBeVisible();
});

test("scopes investment contributions to the reporting period", async ({ page }) => {
  await openReady(page, "/containers", "Where your money lives");
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByLabel("Name").fill("E2E investment period");
  await page.getByRole("radio", { name: "Investment", exact: true }).click();
  await page.getByRole("button", { name: "Create container" }).click();

  await page.getByRole("button", { name: "Actions for E2E investment period" }).click();
  await page.getByRole("menuitem", { name: "Reported balances" }).click();
  await page.getByLabel("As of").fill("2026-01-31");
  await page.getByLabel("Reported value").fill("10.00");
  await page.getByRole("button", { name: "Save report" }).click();
  await expect(page.getByText("2026-01-31", { exact: true })).toBeVisible();
  await page.getByLabel("As of").fill("2026-02-28");
  await page.getByLabel("Reported value").fill("110.00");
  await page.getByRole("button", { name: "Save report" }).click();
  await expect(page.getByText("2026-02-28", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");

  await openReady(page, "/ledger", "Overall balance");
  await openQuickAdd(page);
  await page.getByRole("radio", { name: "Transfer" }).click();
  await page.getByLabel("Amount").fill("100.00");
  await page.getByLabel("Transfer label").fill("E2E investment contribution");
  await choose(page, "From container", "General");
  await choose(page, "To container", "E2E investment period");
  await page.getByLabel("Date and time").fill("2026-02-15T12:00");
  await page.getByRole("button", { name: "Move money" }).click();
  await expect(
    page.getByText("E2E investment contribution", { exact: true }),
  ).toBeVisible();

  await openReady(page, "/", "How the money moved");
  await page.getByRole("button", { name: /Reporting period:/ }).click();
  await page.getByRole("button", { name: "All time", exact: true }).click();
  const card = page
    .getByText("E2E investment period", { exact: true })
    .locator("..")
    .locator("..");
  const contributed = card.locator("span").filter({ hasText: /^contributed/ });
  await expect(contributed).toContainText("$100.00");

  await page.getByRole("button", { name: /Reporting period:/ }).click();
  await page.getByRole("button", { name: "Last 3 months", exact: true }).focus();
  await page.keyboard.press("Enter");

  await expect(contributed).toContainText("$0.00");
});

test("creates, edits, refreshes, and quietly hides ledger notes", async ({ page }) => {
  await createCategory(page, "E2E notes expense");
  await createCategory(page, "E2E notes income", "Income");
  await createContainer(page, "E2E notes savings");
  await openReady(page, "/ledger", "Overall balance");

  await openQuickAdd(page);
  await page.getByLabel("Amount").fill("7.50");
  await page.getByLabel("Vendor").fill("E2E noted expense");
  await page.getByLabel("Notes").fill("Initial expense detail");
  await choose(page, "Category", "E2E notes expense");
  await page.getByRole("button", { name: "Log expense" }).click();
  await expect(page.getByText("Initial expense detail", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Actions for E2E noted expense" }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  await page.getByLabel("Notes").fill("Edited expense detail");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Edited expense detail", { exact: true })).toBeVisible();

  await openQuickAdd(page);
  await page.getByRole("radio", { name: "Income" }).click();
  await page.getByLabel("Amount").fill("20.00");
  await page.getByLabel("Source").fill("E2E noted income");
  await page.getByLabel("Notes").fill("Income detail");
  await choose(page, "Category", "E2E notes income");
  await page.getByRole("button", { name: "Log income" }).click();
  await expect(page.getByText("Income detail", { exact: true })).toBeVisible();

  await openQuickAdd(page);
  await page.getByRole("radio", { name: "Transfer" }).click();
  await page.getByLabel("Amount").fill("5.00");
  await page.getByLabel("Transfer label").fill("E2E noted transfer");
  await page.getByLabel("Notes").fill("Transfer detail");
  await choose(page, "From container", "General");
  await choose(page, "To container", "E2E notes savings");
  await page.getByRole("button", { name: "Move money" }).click();
  await expect(page.getByText("Transfer detail", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Actions for E2E noted transfer" }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  await page.getByLabel("Notes").fill("Edited transfer detail");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Edited transfer detail", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText("Edited expense detail", { exact: true })).toBeVisible();
  await expect(page.getByText("Income detail", { exact: true })).toBeVisible();
  await expect(page.getByText("Edited transfer detail", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Actions for E2E noted expense" }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  await page.getByLabel("Notes").fill("   ");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Edited expense detail", { exact: true })).toBeHidden();
});

test("creates a savings goal", async ({ page }) => {
  await openReady(page, "/goals", "Savings goals");
  await page.getByRole("button", { name: "New", exact: true }).click();
  await expect(page.getByRole("heading", { name: "New savings goal" })).toBeVisible();
  await page.getByLabel("Goal name").fill("E2E rainy day");
  await page.getByRole("combobox").click();
  await page.getByRole("option", { name: "Passive (no plan)" }).click();
  await page.getByLabel("Target (optional)").fill("100.00");
  await page.getByRole("button", { name: "Create goal" }).click();

  await expect(page.getByRole("heading", { name: "E2E rainy day" })).toBeVisible();

  await openReady(page, "/ledger", "Overall balance");
  await openQuickAdd(page);
  await page.getByRole("radio", { name: "Transfer" }).click();
  await page.getByLabel("Amount").fill("100.00");
  await page.getByLabel("Transfer label").fill("Fund E2E rainy day");
  await choose(page, "From container", "General");
  await choose(page, "To container", "E2E rainy day");
  await page.getByRole("button", { name: "Move money" }).click();

  await openReady(page, "/goals", "Savings goals");
  const closed = page.getByRole("heading", { name: "Achieved & closed" }).locator("..");
  await expect(closed.getByRole("heading", { name: "E2E rainy day" })).toBeVisible();

  await page.evaluate(() => {
    const calls: string[] = [];
    Object.defineProperty(window, "__stage4ScrollCalls", {
      configurable: true,
      value: calls,
      writable: true,
    });
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (options) {
      (
        window as unknown as {
          __stage4ScrollCalls: string[];
        }
      ).__stage4ScrollCalls.push(this.textContent ?? "");
      original.call(this, options);
    };
  });

  await closed.getByRole("button", { name: "Actions for E2E rainy day" }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  await page.getByLabel("Target (optional)").fill("200.00");
  await page.evaluate(() => {
    (
      window as unknown as {
        __stage4ScrollCalls: string[];
      }
    ).__stage4ScrollCalls = [];
  });
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.getByRole("heading", { name: "Achieved & closed" })).toBeHidden();
  await expect(page.getByRole("heading", { name: "E2E rainy day" })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as {
            __stage4ScrollCalls: string[];
          }
        ).__stage4ScrollCalls.some((text) => text.includes("E2E rainy day")),
      ),
    )
    .toBe(true);
});

test("approves a generated Inbox occurrence", async ({ page }) => {
  await createCategory(page, "E2E subscriptions");
  await openReady(page, "/recurring", "Scheduled transactions");
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByLabel("Payee / source").fill("E2E recurring");
  await page.getByRole("combobox").first().click();
  await page
    .getByRole("option", { name: "E2E subscriptions · expense", exact: true })
    .click();
  await page.getByLabel("Amount").fill("9.99");
  await page.getByRole("combobox").nth(2).click();
  await page.getByRole("option", { name: "Daily", exact: true }).click();
  await page.getByRole("button", { name: "Add recurring" }).click();

  await page.goto("/inbox");
  await expect(page.getByRole("heading", { name: /to review/ })).toBeVisible();
  const inboxBadge = page
    .getByRole("link", { name: "Inbox" })
    .locator('[aria-label="1 pending"]');
  await expect(inboxBadge).toBeVisible();
  await expect(page.getByText("E2E recurring", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Approve E2E recurring" }).click();
  await expect(page.getByRole("heading", { name: "All clear" })).toBeVisible();
  await expect(inboxBadge).toBeHidden();

  await openReady(page, "/ledger", "Overall balance");
  await expect(page.getByText("E2E recurring", { exact: true })).toBeVisible();
});

test("views the monthly plan", async ({ page }) => {
  await openReady(page, "/plan", "Every dollar a purpose");

  await expect(page.getByRole("heading", { name: "Income expected" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Allowances" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Goal asks" })).toBeVisible();
  await expect(page.getByText("Unallocated", { exact: true })).toBeVisible();
});

async function openPalette(page: Page) {
  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.getByPlaceholder(/Search everything/)).toBeVisible();
}

test("⌘K finds an entry by a word that is only in its notes", async ({ page }) => {
  await createCategory(page, "E2E palette food");
  await openReady(page, "/ledger", "Overall balance");

  await openQuickAdd(page);
  await page.getByLabel("Amount").fill("12.00");
  await page.getByLabel("Vendor").fill("E2E palette payee");
  await page.getByLabel("Notes").fill("aubergine for the weekend");
  await choose(page, "Category", "E2E palette food");
  await page.getByRole("button", { name: "Log expense" }).click();
  await expect(page.getByRole("heading", { name: "Add an entry" })).toBeHidden();

  await openReady(page, "/", "How the money moved");
  await openPalette(page);
  // The word appears in no title anywhere — only in that one row's notes.
  await page.getByPlaceholder(/Search everything/).fill("aubergine");
  await page
    .getByRole("option", { name: /E2E palette payee/ })
    .first()
    .click();

  await expect(page).toHaveURL(/\/ledger/);
  await expect(page.getByText("E2E palette payee", { exact: true })).toBeVisible();
});

test("⌘K narrows entries by an amount token", async ({ page }) => {
  await createCategory(page, "E2E size food");
  await openReady(page, "/ledger", "Overall balance");
  await logExpense(page, "E2E small buy", "3.00", "E2E size food");
  await logExpense(page, "E2E large buy", "300.00", "E2E size food");

  await openPalette(page);
  await page.getByPlaceholder(/Search everything/).fill("E2E buy >100");
  await expect(page.getByRole("option", { name: /E2E large buy/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /E2E small buy/ })).toBeHidden();
});

test("⌘K lands on a category, flagged on its own screen", async ({ page }) => {
  await createCategory(page, "E2E findable category");
  await openReady(page, "/", "How the money moved");

  await openPalette(page);
  await page.getByPlaceholder(/Search everything/).fill("E2E findable");
  await page
    .getByRole("option", { name: /E2E findable category/ })
    .first()
    .click();

  await expect(page).toHaveURL(/\/categories/);
  await expect(page.getByText("E2E findable category", { exact: true })).toBeVisible();
  // The focus param is stripped once the row has been marked.
  await expect(page).not.toHaveURL(/focus=/);
});

test("⌘K toggles closed on the same shortcut that opened it", async ({ page }) => {
  await openReady(page, "/", "How the money moved");
  await openPalette(page);
  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.getByPlaceholder(/Search everything/)).toBeHidden();
});

test("filters the ledger by visible text", async ({ page }) => {
  await createCategory(page, "E2E food");
  await openReady(page, "/ledger", "Overall balance");
  await logExpense(page, "E2E apples", "3.00", "E2E food");
  await logExpense(page, "E2E oranges", "4.00", "E2E food");

  await page.getByRole("textbox", { name: "Search entries" }).fill("apples");
  await expect(page.getByText("E2E apples", { exact: true })).toBeVisible();
  await expect(page.getByText("E2E oranges", { exact: true })).toBeHidden();
  await expect(page.getByRole("button", { name: /Clear 1/ })).toBeVisible();
});

test("FAB hold hints how to create the first shortcut", async ({ page }) => {
  await openReady(page, "/", "How the money moved");
  const fab = page.getByRole("button", { name: "Log a transaction" });
  await fab.focus();
  await page.keyboard.down("Enter");
  await page.waitForTimeout(FAB_HOLD_PAST_THRESHOLD_MS);
  await page.keyboard.up("Enter");

  await expect(page.getByRole("menu", { name: "Quick shortcuts" })).toBeVisible();
  await expect(page.getByText("No shortcuts yet", { exact: true })).toBeVisible();
  await expect(page.getByText(/Save as shortcut/)).toBeVisible();
});

test("separates FAB quick press, hold chooser, and movement cancellation", async ({
  page,
}) => {
  await openReady(page, "/", "How the money moved");
  const fab = page.getByRole("button", { name: "Log a transaction" });
  const box = (await fab.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(300);
  await page.mouse.up();
  await expect(page.getByRole("heading", { name: "Add an entry" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Add an entry" })).toBeHidden();
  await page.waitForTimeout(300);

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(FAB_HOLD_PAST_THRESHOLD_MS);
  await expect(page.getByRole("menu", { name: "Quick shortcuts" })).toBeVisible();
  await page.mouse.up();
  await page.keyboard.press("Escape");

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 11, y);
  await page.waitForTimeout(FAB_HOLD_PAST_THRESHOLD_MS);
  await page.mouse.up();
  await expect(page.getByRole("menu", { name: "Quick shortcuts" })).toBeHidden();

  await fab.evaluate((button) => {
    button.addEventListener(
      "pointerdown",
      (event) => {
        button.setAttribute(
          "data-test-pointer-id",
          String((event as PointerEvent).pointerId),
        );
      },
      { once: true },
    );
  });
  await page.mouse.move(x, y);
  await page.mouse.down();
  const capturedPointer = await fab.getAttribute("data-test-pointer-id");
  expect(capturedPointer).not.toBeNull();
  await fab.dispatchEvent("lostpointercapture", {
    pointerId: Number(capturedPointer),
    pointerType: "mouse",
    isPrimary: true,
  });
  await page.waitForTimeout(FAB_HOLD_PAST_THRESHOLD_MS);
  await page.mouse.up();
  await expect(page.getByRole("menu", { name: "Quick shortcuts" })).toBeHidden();
});

test("supports FAB keyboard hold and Escape cancellation", async ({ page }) => {
  await openReady(page, "/", "How the money moved");
  const fab = page.getByRole("button", { name: "Log a transaction" });

  await fab.focus();
  await page.keyboard.down("Enter");
  await page.waitForTimeout(FAB_HOLD_PAST_THRESHOLD_MS);
  await expect(page.getByRole("menu", { name: "Quick shortcuts" })).toBeVisible();
  await page.keyboard.up("Enter");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu", { name: "Quick shortcuts" })).toBeHidden();
  await expect(fab).toBeFocused();

  await page.keyboard.down(" ");
  await page.waitForTimeout(200);
  await page.keyboard.press("Escape");
  await page.keyboard.up(" ");
  await expect(page.getByRole("menu", { name: "Quick shortcuts" })).toBeHidden();

  await page.keyboard.down(" ");
  await page.waitForTimeout(FAB_HOLD_PAST_THRESHOLD_MS);
  await page.keyboard.up(" ");
  await expect(page.getByRole("menu", { name: "Quick shortcuts" })).toBeFocused();
});

test("opens the FAB chooser from a touch hold", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "touch project only");
  await openReady(page, "/", "How the money moved");
  const fab = page.getByRole("button", { name: "Log a transaction" });
  const box = (await fab.boundingBox())!;
  const session = await page.context().newCDPSession(page);
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [point],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(page.getByRole("heading", { name: "Add an entry" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Add an entry" })).toBeHidden();
  await page.waitForTimeout(300);

  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [point],
  });
  await page.waitForTimeout(FAB_HOLD_PAST_THRESHOLD_MS);
  await expect(page.getByRole("menu", { name: "Quick shortcuts" })).toBeVisible();
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await page.keyboard.press("Escape");

  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [point],
  });
  await page.waitForTimeout(200);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchCancel",
    touchPoints: [],
  });
  await page.waitForTimeout(FAB_HOLD_PAST_THRESHOLD_MS);
  await expect(page.getByRole("menu", { name: "Quick shortcuts" })).toBeHidden();
});

test("keeps FAB geometry and shows a compact money-add mark", async ({
  page,
}, testInfo) => {
  await openReady(page, "/", "How the money moved");

  const fab = page.getByRole("button", { name: "Log a transaction" });
  const fabBox = await fab.boundingBox();
  expect(fabBox).not.toBeNull();
  expect(fabBox!.width).toBe(56);
  expect(fabBox!.height).toBe(56);

  const mark = fab.locator("[data-money-add-mark]");
  await expect(mark).toBeVisible();
  await expect(mark.locator("svg")).toHaveCount(2);
  expect(
    await mark
      .locator("svg")
      .evaluateAll((icons) =>
        icons.every((icon) => icon.getAttribute("aria-hidden") === "true"),
      ),
  ).toBe(true);

  const markBox = await mark.boundingBox();
  expect(markBox).not.toBeNull();
  expect(markBox!.width).toBeLessThanOrEqual(28);
  expect(markBox!.height).toBeLessThanOrEqual(28);

  const dollarBox = await mark.locator("[data-money-add-dollar]").boundingBox();
  const plusBox = await mark.locator("[data-money-add-plus]").boundingBox();
  expect(dollarBox).not.toBeNull();
  expect(plusBox).not.toBeNull();
  expect(plusBox!.x).toBeGreaterThan(dollarBox!.x + dollarBox!.width / 2);
  expect(plusBox!.y).toBeLessThan(dollarBox!.y + dollarBox!.height / 2);

  const viewport = page.viewportSize()!;
  expect(viewport.width - fabBox!.x - fabBox!.width).toBe(
    testInfo.project.name === "mobile" ? 20 : 32,
  );
  // Mobile: the FAB clears the tab bar by 0.5rem, so this tracks
  // `--mobile-tab-bar-height` (3.5rem) + 8px. It was pinned to a hardcoded
  // 4.25rem until 751b5a2 tied it to the variable; the constant here is the
  // half of that change that was missed.
  expect(viewport.height - fabBox!.y - fabBox!.height).toBe(
    testInfo.project.name === "mobile" ? 64 : 32,
  );

  await fab.focus();
  await fab.press("Enter");
  await expect(page.getByRole("radio", { name: "Expense" })).toBeChecked();
});

test("places toasts below mobile top navigation and bottom-right on desktop", async ({
  page,
}, testInfo) => {
  await createCategory(page, "E2E toast placement");
  await page.getByRole("button", { name: "Actions for E2E toast placement" }).click();
  await page.getByRole("menuitem", { name: "Archive" }).click();

  const toast = page.locator("[data-sonner-toast][data-mounted=true]").last();
  await expect(toast).toBeVisible();

  if (testInfo.project.name === "mobile") {
    const topBar = page.locator("header").first();
    const topBarBox = await topBar.boundingBox();
    expect(topBarBox).not.toBeNull();
    await expect
      .poll(async () => {
        const toastBox = await toast.boundingBox();
        return toastBox?.y ?? 0;
      })
      .toBeGreaterThanOrEqual(topBarBox!.y + topBarBox!.height);
    return;
  }

  const toastBox = await toast.boundingBox();
  expect(toastBox).not.toBeNull();
  expect(toastBox!.x + toastBox!.width).toBeGreaterThan(page.viewportSize()!.width / 2);
  expect(toastBox!.y + toastBox!.height).toBeGreaterThan(page.viewportSize()!.height / 2);
});

test("renders diagnostics without a hydration mismatch", async ({ page }) => {
  // `/settings` is prerendered on a build machine with no `navigator`, so the
  // user agent, language and time zone are blank in the HTML. Rendering the
  // real values on the FIRST client render would disagree with that markup;
  // React would log a mismatch and replace the DOM it just hydrated.
  // React raises the mismatch as an uncaught error, NOT a console message, so
  // listening on `console` alone silently passes even when the bug is present.
  const complaints: string[] = [];
  const noteIfHydration = (text: string) => {
    if (/hydrat|server rendered text didn't match/i.test(text)) complaints.push(text);
  };
  page.on("pageerror", (error) => noteIfHydration(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      noteIfHydration(message.text());
    }
  });

  await openReady(page, "/settings", "Under the hood");

  // Every blanked fact still arrives — the blanking lasts one render, not for
  // good, and `Copy diagnostics` reads the same unblanked `facts()`.
  const value = (name: string) =>
    page.locator("dt", { hasText: new RegExp(`^${name}$`) }).locator("+ dd");
  await expect(value("user agent")).toContainText(/Mozilla/);
  await expect(value("language")).not.toHaveText("—");
  await expect(value("time zone")).toContainText("/");
  expect(complaints).toEqual([]);
});

test("exports every change as a versioned file", async ({ page }) => {
  await createCategory(page, "E2E export me");
  await openReady(page, "/ledger", "Overall balance");
  await logExpense(page, "E2E exported", "9.99", "E2E export me");

  await openReady(page, "/settings", "Under the hood");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export", exact: true }).click(),
  ]);

  expect(download.suggestedFilename()).toMatch(
    /^yaccount-export-\d{4}-\d{2}-\d{2}\.json$/,
  );
  const path = await download.path();
  const file = JSON.parse(await readFile(path, "utf8")) as {
    format: string;
    version: number;
    opCount: number;
    ops: { type: string }[];
  };
  expect(file.format).toBe("yaccount.export");
  expect(file.version).toBe(1);
  expect(file.opCount).toBe(file.ops.length);
  // The journal, not a row dump — the category and the expense are both in it.
  expect(file.ops.map((o) => o.type)).toContain("category.create");
  expect(file.ops.map((o) => o.type)).toContain("transaction.create");
});

test("refuses an invalid import and changes nothing", async ({ page }) => {
  await createCategory(page, "E2E keep me");
  await openReady(page, "/settings", "Under the hood");

  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "Choose file", exact: true }).click(),
  ]);
  await chooser.setFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"format":"something.else","ops":[]}'),
  });

  await expect(page.getByText("That file wasn't imported.")).toBeVisible();
  await expect(page.getByText("That file is not a yaccount export.")).toBeVisible();
  await openReady(page, "/categories", "What your money does");
  await expect(page.getByText("E2E keep me", { exact: true })).toBeVisible();
});

test("clear-all cannot be triggered by accident", async ({ page }) => {
  await createCategory(page, "E2E clear me");
  await openReady(page, "/ledger", "Overall balance");
  await logExpense(page, "E2E doomed", "4.50", "E2E clear me");

  await openReady(page, "/settings", "Under the hood");
  await page.getByRole("button", { name: "Clear everything", exact: true }).click();

  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText("Clear everything?");
  const action = confirm.getByRole("button", { name: "Clear everything", exact: true });
  await expect(action).toBeDisabled();

  // A near miss stays disabled — only the exact word arms it.
  await confirm.getByRole("textbox").fill("eras");
  await expect(action).toBeDisabled();
  await confirm.getByRole("textbox").fill("erase");
  await expect(action).toBeEnabled();

  await action.click();
  await expect(page.getByText("Everything cleared", { exact: true })).toBeVisible();

  await openReady(page, "/ledger", "Overall balance");
  await expect(page.getByText("E2E doomed", { exact: true })).toBeHidden();
  await openReady(page, "/categories", "What your money does");
  await expect(page.getByText("E2E clear me", { exact: true })).toBeHidden();
});

test("clear-all can be abandoned without touching anything", async ({ page }) => {
  await createCategory(page, "E2E survivor");
  await openReady(page, "/settings", "Under the hood");

  await page.getByRole("button", { name: "Clear everything", exact: true }).click();
  const confirm = page.getByRole("alertdialog");
  await confirm.getByRole("textbox").fill("erase");
  await confirm.getByRole("button", { name: "Keep it" }).click();
  await expect(confirm).toBeHidden();

  await openReady(page, "/categories", "What your money does");
  await expect(page.getByText("E2E survivor", { exact: true })).toBeVisible();
});
