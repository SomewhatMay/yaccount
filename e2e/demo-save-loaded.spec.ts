import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const DEMO_SAVE = resolve(process.cwd(), "public/demo-save/yaccount-demo-save.json");

test("the demo save imports and supplies the main app routes and shortcuts", async ({
  page,
}) => {
  await page.goto("/settings");
  await page.locator('input[type="file"]').setInputFiles(DEMO_SAVE);

  const confirmation = page.getByRole("alertdialog");
  await expect(
    confirmation.getByRole("heading", { name: "Replace everything with this file?" }),
  ).toBeVisible();
  await confirmation.getByLabel("Type replace to continue").fill("replace");
  await confirmation.getByRole("button", { name: "Replace everything" }).click();
  await expect(page.getByText("Import complete")).toBeVisible();

  await page.goto("/");
  const dashboards = page.getByRole("navigation", { name: "Dashboard sets" });
  await expect(dashboards.getByRole("button", { name: "01 · Overview" })).toBeVisible();
  await expect(page.getByText("Overall balance").first()).toBeVisible();
  await expect(page.getByText("Money brief").first()).toBeVisible();
  await dashboards.getByRole("button", { name: "02 · Planning" }).click();
  await expect(page.getByText("Commitments").first()).toBeVisible();
  await expect(page.getByText("Cash horizon").first()).toBeVisible();
  await dashboards.getByRole("button", { name: "03 · Forecasts & Watch" }).click();
  await expect(page.getByText("Money map").first()).toBeVisible();
  await dashboards.getByRole("button", { name: "04 · Analysis" }).click();
  await expect(page.getByText("Income resilience").first()).toBeVisible();
  await expect(page.getByText("Spending calendar").first()).toBeVisible();

  const pages = [
    ["/ledger", "Ledger"],
    ["/inbox", "Studio retainer"],
    ["/plan", "Plan"],
    ["/goals", "Goals"],
    ["/cravings", "Skipped a takeout order"],
    ["/recurring", "Daily savings sweep"],
    ["/containers", "Containers"],
    ["/categories", "Categories"],
    ["/settings", "Settings"],
  ] as const;

  for (const [route, marker] of pages) {
    await page.goto(route);
    await expect(
      page.locator("main").getByText(marker, { exact: true }).first(),
    ).toBeVisible();
  }

  await page.getByRole("button", { name: "Log a transaction" }).click();
  await expect(page.getByRole("heading", { name: "Add an entry" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Shortcuts" })).toBeVisible();
  await expect(page.getByText("Weekly groceries", { exact: true })).toBeVisible();
  await expect(page.getByText("Payday", { exact: true })).toBeVisible();
  await expect(page.getByText("Move to savings", { exact: true })).toBeVisible();
});
