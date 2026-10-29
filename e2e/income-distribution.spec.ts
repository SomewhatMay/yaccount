import { expect, test, type Page } from "@playwright/test";

/**
 * Income distribution end to end (plans/income-distribution.md): a preset made
 * in Plan, an income split through it from compose, read back on the register,
 * edited, deleted and undone, approved from the Inbox, and logged from a
 * shortcut — with the container balances checked to the cent each time.
 */

const SHOTS = process.env.E2E_SHOTS_DIR;

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    if (sessionStorage.getItem("yaccount.e2e.storage-cleared")) return;
    localStorage.clear();
    sessionStorage.setItem("yaccount.e2e.storage-cleared", "true");
  });
});

async function openReady(page: Page, path: string, marker: string | RegExp) {
  await page.goto(path);
  await expect(
    page.getByText(marker, { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible();
}

async function choose(page: Page, label: string, option: string) {
  const combobox = page.getByRole("combobox", { name: label });
  if ((await combobox.evaluate((element) => element.tagName)) === "INPUT") {
    await combobox.fill(option);
  } else {
    await combobox.click();
  }
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function createCategory(page: Page, name: string, direction: "Expense" | "Income") {
  await openReady(page, "/categories", "Categories");
  await page.getByRole("button", { name: "New", exact: true }).click();
  await expect(page.getByRole("heading", { name: "New category" })).toBeVisible();
  await page.getByLabel("Name").fill(name);
  await page.getByRole("radio", { name: direction }).click();
  await page.getByRole("button", { name: "Create category" }).click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
}

async function createContainer(page: Page, name: string) {
  await openReady(page, "/containers", "Containers");
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

/** Plan → New distribution with the given shares; rest stays General. */
async function createPreset(page: Page, name: string, shares: [string, string][]) {
  await openReady(page, "/plan", "Plan");
  const card = page.getByRole("region", { name: "Distributions" });
  await card.getByRole("button", { name: "New", exact: true }).click();
  await expect(page.getByRole("heading", { name: "New distribution" })).toBeVisible();
  await page.getByLabel("Name").fill(name);
  for (const [container, pct] of shares) {
    await choose(page, "Add a container", container);
    await page.getByLabel(`${container} share`).fill(pct);
  }
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("heading", { name: "New distribution" })).toBeHidden();
  await expect(card.getByText(name, { exact: true })).toBeVisible();
}

async function setup(page: Page) {
  await createContainer(page, "Savings");
  await createContainer(page, "Invest");
  await createCategory(page, "Salary", "Income");
  await createPreset(page, "Paycheck", [
    ["Savings", "20"],
    ["Invest", "33"],
  ]);
}

async function logIncome(page: Page, source: string, amount: string) {
  await openReady(page, "/ledger", "Overall balance");
  await openQuickAdd(page);
  await page.getByRole("radio", { name: "Income" }).click();
  await page.getByLabel("Amount").fill(amount);
  await page.getByLabel("Source").fill(source);
  await choose(page, "Category", "Salary");
}

/** Each container's row on /containers shows its balance. */
async function expectBalances(page: Page, expected: Record<string, string>) {
  await openReady(page, "/containers", "Containers");
  for (const [name, amount] of Object.entries(expected)) {
    const row = page
      .locator("div.group")
      .filter({
        has: page.getByRole("button", { name: `Actions for ${name}`, exact: true }),
      });
    await expect(row).toContainText(amount);
  }
}

test("creates a distribution in Plan with a live preview and rest share", async ({
  page,
}) => {
  await createContainer(page, "Savings");
  await createContainer(page, "Invest");
  await openReady(page, "/plan", "Plan");
  const card = page.getByRole("region", { name: "Distributions" });
  await expect(card.getByText(/split each paycheck across containers/)).toBeVisible();
  await card.getByRole("button", { name: "New", exact: true }).click();
  await page.getByLabel("Name").fill("Paycheck");
  await page.getByLabel("Preview on").fill("3000");
  await choose(page, "Add a container", "Savings");
  await page.getByLabel("Savings share").fill("20");
  await choose(page, "Add a container", "Invest");
  await page.getByLabel("Invest share").fill("33");
  await expect(page.getByTestId("rest-share")).toHaveText("47%");
  const preview = page.getByTestId("split-breakdown").last();
  await expect(preview).toContainText("$600.00");
  await expect(preview).toContainText("$990.00");
  await expect(preview).toContainText("$1,410.00");
  await expect(preview).toContainText("$3,000.00");
  await shot(page, "plan-sheet");

  // Over 100% is flagged and blocks Save.
  await page.getByLabel("Invest share").fill("85");
  await expect(page.getByText("Over 100% by 5%.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await page.getByLabel("Invest share").fill("33");

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(card.getByText("Paycheck", { exact: true })).toBeVisible();
  // The first distribution becomes the default.
  await expect(card.getByText("default")).toBeVisible();
  await expect(
    card.getByText("Savings 20% · Invest 33% · General 47% rest"),
  ).toBeVisible();
  await shot(page, "plan-card");
});

test("splits a logged income and shows one register row with its breakdown", async ({
  page,
}) => {
  await setup(page);
  await logIncome(page, "Acme payroll", "3000");

  const distribute = page.getByRole("checkbox", { name: "Distribute" });
  await expect(distribute).toBeChecked(); // default preset, no history yet
  await expect(page.getByTestId("distribution-label")).toContainText(
    "distributing via Paycheck",
  );
  await expect(page.getByRole("combobox", { name: "Container" })).toHaveCount(0);
  await page.getByRole("button", { name: "How this income is split" }).click();
  const popover = page.getByRole("dialog").getByTestId("split-breakdown");
  await expect(popover).toContainText("$600.00");
  await expect(popover).toContainText("$990.00");
  await expect(popover).toContainText("$1,410.00");
  await shot(page, "compose-popover");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Log income" }).click();
  await expect(page.getByRole("heading", { name: "Add an entry" })).toBeHidden();

  // One register row, not three.
  await expect(page.getByText("Acme payroll", { exact: true })).toHaveCount(1);
  await expect(page.getByText(/Salary · split 3 ways/)).toBeVisible();
  await page.getByRole("button", { name: "How this income is split" }).click();
  const breakdown = page.getByRole("dialog").getByTestId("split-breakdown");
  await expect(breakdown).toContainText("Savings");
  await expect(breakdown).toContainText("20%");
  await expect(breakdown).toContainText("47% rest");
  await shot(page, "ledger-popover");
  await page.keyboard.press("Escape");
  // The popover must not have opened the edit sheet underneath.
  await expect(page.getByRole("heading", { name: "Edit transaction" })).toBeHidden();

  await expectBalances(page, {
    General: "$1,410.00",
    Savings: "$600.00",
    Invest: "$990.00",
  });
});

test("rounds every cent into the rest container", async ({ page }) => {
  await createContainer(page, "Savings");
  await createContainer(page, "Invest");
  await createCategory(page, "Salary", "Income");
  await createPreset(page, "Thirds", [
    ["Savings", "33.33"],
    ["Invest", "33.33"],
  ]);
  await logIncome(page, "Odd amount", "100.01");
  await page.getByRole("button", { name: "Log income" }).click();
  await expect(page.getByRole("heading", { name: "Add an entry" })).toBeHidden();
  // floor(10001 × 0.3333) = 3333 each; rest = 10001 − 6666 = 3335.
  await expectBalances(page, {
    Savings: "$33.33",
    Invest: "$33.33",
    General: "$33.35",
  });
});

test("filtering to a part container shows the split inline with that line lit", async ({
  page,
}) => {
  await setup(page);
  await logIncome(page, "Acme payroll", "3000");
  await page.getByRole("button", { name: "Log income" }).click();
  await expect(page.getByRole("heading", { name: "Add an entry" })).toBeHidden();

  await page.getByRole("button", { name: "Wallet" }).click();
  await page.getByRole("checkbox", { name: "Savings" }).click();
  await page.keyboard.press("Escape");
  const inline = page.getByTestId("split-breakdown");
  await expect(inline).toBeVisible();
  const lit = inline.locator("[data-highlighted]");
  await expect(lit).toHaveCount(1);
  await expect(lit).toContainText("Savings");
  await expect(lit).toContainText("$600.00");
  await shot(page, "ledger-filtered");

  // Searching for a part container does the same.
  await page.getByRole("button", { name: /Clear/ }).first().click();
  await page.getByLabel("Search entries").fill("invest");
  await expect(
    page.getByTestId("split-breakdown").locator("[data-highlighted]"),
  ).toContainText("Invest");
});

test("edits re-split, untick lands whole, delete and undo move the whole group", async ({
  page,
}) => {
  await setup(page);
  await logIncome(page, "Acme payroll", "3000");
  await page.getByRole("button", { name: "Log income" }).click();
  await expect(page.getByRole("heading", { name: "Add an entry" })).toBeHidden();

  // Re-split on a new amount.
  await page.getByText("Acme payroll", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "Edit transaction" })).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: "Distribute across containers" }),
  ).toBeChecked();
  await page.getByLabel("Amount").fill("3200");
  await expect(page.getByText(/Saving re-splits at Paycheck/)).toBeVisible();
  await shot(page, "edit-resplit");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { name: "Edit transaction" })).toBeHidden();
  await expectBalances(page, {
    Savings: "$640.00",
    Invest: "$1,056.00",
    General: "$1,504.00",
  });

  // Untick → everything back in one container.
  await openReady(page, "/ledger", "Overall balance");
  await page.getByText("Acme payroll", { exact: true }).click();
  await page.getByRole("checkbox", { name: "Distribute across containers" }).click();
  await expect(page.getByRole("combobox", { name: "Container" })).toBeVisible();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { name: "Edit transaction" })).toBeHidden();
  await expect(page.getByText(/Salary · split 3 ways/)).toHaveCount(0);
  await expectBalances(page, { Savings: "$0.00", Invest: "$0.00", General: "$3,200.00" });

  // Tick it again → split again.
  await openReady(page, "/ledger", "Overall balance");
  await page.getByText("Acme payroll", { exact: true }).click();
  await page.getByRole("checkbox", { name: "Distribute across containers" }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(/Salary · split 3 ways/)).toBeVisible();
  await expectBalances(page, { Savings: "$640.00", Invest: "$1,056.00" });

  // Delete takes the transfers with it; Undo brings all of them back.
  await openReady(page, "/ledger", "Overall balance");
  await page.getByRole("button", { name: "Actions for Acme payroll" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(page.getByText("Acme payroll", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText(/Salary · split 3 ways/)).toBeVisible();
  await expectBalances(page, {
    Savings: "$640.00",
    Invest: "$1,056.00",
    General: "$1,504.00",
  });
});

test("recalls per category: a one-container income unticks next time", async ({
  page,
}) => {
  await setup(page);
  await logIncome(page, "Bonus", "500");
  await page.getByRole("checkbox", { name: "Distribute" }).click();
  await expect(page.getByRole("combobox", { name: "Container" })).toBeVisible();
  await page.getByRole("button", { name: "Log income" }).click();
  await expect(page.getByRole("heading", { name: "Add an entry" })).toBeHidden();

  await openQuickAdd(page);
  await page.getByRole("radio", { name: "Income" }).click();
  await choose(page, "Category", "Salary");
  await expect(page.getByRole("checkbox", { name: "Distribute" })).not.toBeChecked();
});

test("a recurring income splits when approved from the Inbox", async ({ page }) => {
  await setup(page);
  await openReady(page, "/recurring", "Recurring");
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByRole("radio", { name: "income" }).click();
  await page.getByLabel("Payee / source").fill("Monthly pay");
  await choose(page, "Category", "Salary · income");
  await page.getByLabel("Amount").fill("1000");
  await page.getByRole("checkbox", { name: "Distribute across containers" }).click();
  await expect(page.getByRole("combobox", { name: "Distribution" })).toBeVisible();
  await choose(page, "Repeats", "Daily");
  await page.getByRole("button", { name: "Add recurring" }).click();
  await expect(page.getByText(/via Paycheck/)).toBeVisible();

  await page.goto("/inbox");
  await expect(page.getByText("Monthly pay", { exact: true })).toBeVisible();
  await expect(page.getByText(/via Paycheck/)).toBeVisible();
  await shot(page, "inbox");
  await page.getByRole("button", { name: "Approve Monthly pay" }).click();
  await expect(page.getByText("Nothing to review", { exact: true })).toBeVisible();

  await openReady(page, "/ledger", "Overall balance");
  await expect(page.getByText(/Salary · split 3 ways/)).toBeVisible();
  await expectBalances(page, {
    Savings: "$200.00",
    Invest: "$330.00",
    General: "$470.00",
  });
});

test("a saved shortcut keeps splitting", async ({ page }) => {
  await setup(page);
  await logIncome(page, "Acme payroll", "1000");
  await page.getByRole("button", { name: "Log income" }).click();
  await expect(page.getByRole("heading", { name: "Add an entry" })).toBeHidden();
  await page.getByRole("button", { name: "Actions for Acme payroll" }).click();
  await page.getByRole("menuitem", { name: "Save as shortcut" }).click();

  await openQuickAdd(page);
  await page
    .getByRole("button", { name: /^Acme payroll/ })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: "Add an entry" })).toBeHidden();
  await expect(page.getByText(/Salary · split 3 ways/)).toHaveCount(2);
  await expectBalances(page, {
    Savings: "$400.00",
    Invest: "$660.00",
    General: "$940.00",
  });
});

test("archiving a preset stops offering it and can be undone", async ({ page }) => {
  await setup(page);
  const card = page.getByRole("region", { name: "Distributions" });
  await card.getByRole("button", { name: "Edit Paycheck" }).click();
  await page.getByRole("button", { name: "Archive" }).click();
  await expect(card.getByRole("button", { name: "Edit Paycheck" })).toHaveCount(0);

  await logIncome(page, "Acme payroll", "100");
  await expect(page.getByRole("checkbox", { name: "Distribute" })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Container" })).toBeVisible();
  await page.keyboard.press("Escape");

  await openReady(page, "/plan", "Plan");
  await card.getByRole("button", { name: /Archived/ }).click();
  await card.getByRole("button", { name: "Restore" }).click();
  await expect(card.getByRole("button", { name: "Edit Paycheck" })).toBeVisible();
});
