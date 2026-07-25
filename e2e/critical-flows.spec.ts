import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function openReady(page: Page, path: string, marker: string | RegExp) {
  await page.goto(path);
  await expect(page.getByText(marker, { exact: true }).first()).toBeVisible();
}

async function choose(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
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
  await context.addInitScript(() => localStorage.clear());
});

test("logs an expense and shows it in the ledger", async ({ page }) => {
  await createCategory(page, "E2E groceries");
  await openReady(page, "/ledger", "Overall balance");
  await logExpense(page, "E2E market", "12.34", "E2E groceries");

  await expect(page.getByText("E2E market", { exact: true })).toBeVisible();
  await expect(page.getByText("-$12.34", { exact: true }).last()).toBeVisible();
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
  await page.getByRole("button", { name: "Create goal" }).click();

  await expect(page.getByRole("heading", { name: "E2E rainy day" })).toBeVisible();
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
  await expect(page.getByText("E2E recurring", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Approve E2E recurring" }).click();
  await expect(page.getByRole("heading", { name: "All clear" })).toBeVisible();

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

test("opens FAB quick-add from the dashboard", async ({ page }) => {
  await openReady(page, "/", "How the money moved");
  await openQuickAdd(page);

  await expect(page.getByRole("radio", { name: "Expense" })).toBeChecked();
  await expect(page.getByLabel("Amount")).toBeFocused();
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
  await expect(page.getByRole("heading", { name: "Add an entry" })).toHaveCount(1);
  await expect(page.getByRole("radio", { name: "Expense" })).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Add an entry" })).toBeHidden();
  await page.waitForTimeout(300);

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(550);
  await expect(page.getByRole("menu", { name: "Choose what to add" })).toBeVisible();
  await page.mouse.up();
  await expect(page.getByRole("heading", { name: "Add an entry" })).toBeHidden();
  await page.getByRole("menuitem", { name: "Income" }).click();
  await expect(page.getByRole("radio", { name: "Income" })).toBeChecked();
  await page.keyboard.press("Escape");

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 11, y);
  await page.waitForTimeout(550);
  await page.mouse.up();
  await expect(page.getByRole("menu", { name: "Choose what to add" })).toBeHidden();
  await expect(page.getByRole("heading", { name: "Add an entry" })).toBeHidden();

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
  await page.waitForTimeout(550);
  await page.mouse.up();
  await expect(page.getByRole("menu", { name: "Choose what to add" })).toBeHidden();
  await expect(page.getByRole("heading", { name: "Add an entry" })).toBeHidden();
});

test("supports FAB keyboard hold and Escape cancellation", async ({ page }) => {
  await openReady(page, "/", "How the money moved");
  const fab = page.getByRole("button", { name: "Log a transaction" });

  await fab.focus();
  await page.keyboard.down("Enter");
  await page.waitForTimeout(550);
  await expect(page.getByRole("menu", { name: "Choose what to add" })).toBeVisible();
  await page.keyboard.up("Enter");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu", { name: "Choose what to add" })).toBeHidden();
  await expect(fab).toBeFocused();

  await page.keyboard.down(" ");
  await page.waitForTimeout(200);
  await page.keyboard.press("Escape");
  await page.keyboard.up(" ");
  await expect(page.getByRole("heading", { name: "Add an entry" })).toBeHidden();

  await page.keyboard.down(" ");
  await page.waitForTimeout(550);
  await page.keyboard.up(" ");
  await expect(page.getByRole("menuitem", { name: "Expense" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("radio", { name: "Transfer" })).toBeChecked();
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
  await expect(page.getByRole("heading", { name: "Add an entry" })).toHaveCount(1);
  await expect(page.getByRole("radio", { name: "Expense" })).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Add an entry" })).toBeHidden();
  await page.waitForTimeout(300);

  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [point],
  });
  await page.waitForTimeout(550);
  await expect(page.getByRole("menu", { name: "Choose what to add" })).toBeVisible();
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(page.getByRole("heading", { name: "Add an entry" })).toBeHidden();
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
  await page.waitForTimeout(550);
  await expect(page.getByRole("menu", { name: "Choose what to add" })).toBeHidden();
  await expect(page.getByRole("heading", { name: "Add an entry" })).toBeHidden();
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
  expect(viewport.height - fabBox!.y - fabBox!.height).toBe(
    testInfo.project.name === "mobile" ? 76 : 32,
  );

  await fab.focus();
  await fab.press("Enter");
  await expect(page.getByRole("radio", { name: "Expense" })).toBeChecked();
});

test("places toasts below mobile top navigation and bottom-right on desktop", async ({
  page,
}, testInfo) => {
  await createCategory(page, "E2E toast placement");

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
