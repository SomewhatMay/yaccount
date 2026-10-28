import { expect, test } from "@playwright/test";

test("Settings offers the curated demo save for download", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

  const link = page.getByRole("link", { name: "Download demo save" });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("download", "yaccount-demo-save.json");

  const href = await link.getAttribute("href");
  const response = await page.request.get(new URL(href!, page.url()).href);
  expect(response.ok()).toBe(true);
  const file = await response.json();
  expect(file.format).toBe("yaccount.export");
  expect(file.opCount).toBe(file.ops.length);
});
