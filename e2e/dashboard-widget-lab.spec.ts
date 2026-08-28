import { resolve } from "node:path";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

const FIXTURE = resolve(
  process.cwd(),
  "test-data/yaccount-dashboard-widget-lab-2026-08-26.json",
);

const DASHBOARDS = [
  {
    name: "01 · Planning",
    headings: [
      ["Money brief", 1],
      ["Budget triage", 1],
      ["Commitments", 1],
      ["Cash horizon", 1],
      ["Allocation plan", 1],
      ["Goal outlook", 1],
      ["Recent entries", 1],
    ] as const,
  },
  {
    name: "02 · Forecast & Watch",
    headings: [
      ["Money map", 1],
      ["Month landing", 1],
      ["Container watch", 3],
      ["Category watch", 2],
    ] as const,
  },
  {
    name: "03 · Analysis",
    period: "Last 12 months",
    headings: [
      ["What changed", 1],
      ["Money flow", 1],
      ["Spending calendar", 1],
      ["Where it went", 1],
      ["Top payees", 1],
      ["Largest entries", 1],
      ["Income resilience", 1],
      ["Month by month", 1],
      ["Income → expenses → savings", 1],
      ["Container flows", 1],
      ["Investments", 1],
      ["Budget comparison", 1],
      ["Recent entries", 1],
    ] as const,
  },
  {
    name: "04 · Compact",
    period: "Last 12 months",
    headings: [
      ["Money brief", 1],
      ["Money map", 1],
      ["Budget triage", 1],
      ["What changed", 1],
      ["Commitments", 1],
      ["Cash horizon", 1],
      ["Allocation plan", 1],
      ["Goal outlook", 1],
      ["Month landing", 1],
      ["Income resilience", 1],
      ["Container watch", 1],
      ["Category watch", 1],
      ["Recent entries", 1],
    ] as const,
  },
] as const;

async function importFixture(page: Page) {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles(FIXTURE);
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toContainText("212 changes", { timeout: 30_000 });
  await confirmation.getByRole("textbox").fill("replace");
  await confirmation
    .getByRole("button", { name: "Replace everything", exact: true })
    .click();
  await expect(page.getByText("Import complete", { exact: true })).toBeVisible();
}

async function inspectDashboard(
  page: Page,
  testInfo: TestInfo,
  dashboard: (typeof DASHBOARDS)[number],
) {
  await page.getByRole("button", { name: dashboard.name, exact: true }).click();
  if ("period" in dashboard) {
    await page.getByRole("button", { name: /Reporting period:/ }).click();
    await page.getByRole("button", { name: dashboard.period, exact: true }).click();
    await expect(
      page.getByRole("button", { name: /Reporting period:/ }),
    ).toHaveAccessibleName(`Reporting period: ${dashboard.period}`);
    await page.keyboard.press("Escape");
  }
  const balance = page
    .getByText("Overall balance", { exact: true })
    .first()
    .locator("xpath=ancestor::*[@data-widget-size][1]");
  await expect(balance).toBeVisible();
  await balance.screenshot({
    path: testInfo.outputPath(
      `${testInfo.project.name}-${dashboard.name.slice(0, 2)}-overall-balance.png`,
    ),
  });
  for (const [title, count] of dashboard.headings) {
    const headings = page.getByRole("heading", { name: title, exact: true });
    await expect(headings).toHaveCount(count);
    for (let index = 0; index < count; index += 1) {
      await headings.nth(index).scrollIntoViewIfNeeded();
      await expect(headings.nth(index)).toBeVisible();
      const surface = headings
        .nth(index)
        .locator("xpath=ancestor::*[@data-widget-size][1]");
      await expect(surface.locator('[aria-busy="true"]')).toHaveCount(0, {
        timeout: 15_000,
      });
      const slug = title.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-");
      await surface.screenshot({
        path: testInfo.outputPath(
          `${testInfo.project.name}-${dashboard.name.slice(0, 2)}-${slug}-${index + 1}.png`,
        ),
      });
    }
  }
  const width = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(width.content).toBe(width.viewport);
  await page.evaluate(() => window.scrollTo({ top: 0 }));
  const path = testInfo.outputPath(
    `${testInfo.project.name}-${dashboard.name.slice(0, 2)}.png`,
  );
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(`${testInfo.project.name} ${dashboard.name}`, {
    path,
    contentType: "image/png",
  });
}

test("imports and renders every dashboard widget lab", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.clock.setFixedTime(new Date("2026-08-26T12:00:00-04:00"));
  await importFixture(page);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "01 · Planning" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  for (const dashboard of DASHBOARDS) {
    await inspectDashboard(page, testInfo, dashboard);
  }
});

test("switches dashboards during native Recharts animation", async ({ page }) => {
  test.setTimeout(60_000);
  await page.clock.setFixedTime(new Date("2026-08-26T12:00:00-04:00"));
  await importFixture(page);
  await page.goto("/");

  await page.getByRole("button", { name: "03 · Analysis", exact: true }).click();
  const breakdown = page
    .getByRole("heading", { name: "Where it went", exact: true })
    .locator("xpath=ancestor::*[@data-widget-size][1]");
  const sector = breakdown.locator(".recharts-sector").first();
  await expect(sector).toBeVisible();
  const firstGeometry = await sector.getAttribute("d");
  await expect
    .poll(() => sector.getAttribute("d"), { timeout: 800 })
    .not.toBe(firstGeometry);

  const compact = page.getByRole("button", { name: "04 · Compact", exact: true });
  await compact.click({ timeout: 750 });
  await expect(compact).toHaveAttribute("aria-current", "page", { timeout: 750 });
});

test("month close explicitly matches an approved manual entry", async ({ page }) => {
  test.setTimeout(60_000);
  await page.clock.setFixedTime(new Date("2026-08-31T12:00:00-04:00"));
  await importFixture(page);
  await page.goto("/");

  await expect(page.getByText("Close August", { exact: true })).toBeVisible();
  const useCandidate = page.getByRole("button", {
    name: "Use Studio retainer deposit entry for Studio retainer on Aug 24",
  });
  await expect(useCandidate).toBeVisible();
  await useCandidate.click();
  await expect(page.getByText("Entry matched", { exact: true })).toBeVisible();
  await expect(useCandidate).toHaveCount(0);

  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(useCandidate).toBeVisible();
});
