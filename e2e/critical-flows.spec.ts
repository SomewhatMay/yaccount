import { expect, test, type Page } from "@playwright/test";

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
