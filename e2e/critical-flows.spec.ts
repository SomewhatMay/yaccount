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
const hydrationFailures = new WeakMap<Page, string[]>();

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

async function logExpense(page: Page, payee: string, amount: string, category: string) {
  await openQuickAdd(page);
  await expect(page.getByLabel("Vendor")).toBeVisible();
  await page.getByLabel("Amount").fill(amount);
  await page.getByLabel("Vendor").fill(payee);
  await choose(page, "Category", category);
  await page.getByRole("button", { name: "Log expense" }).click();
  await expect(page.getByRole("heading", { name: "Add an entry" })).toBeHidden();
}

async function logIncomeOn(
  page: Page,
  source: string,
  amount: string,
  category: string,
  date: string,
) {
  await openReady(page, "/ledger", "Overall balance");
  await openQuickAdd(page);
  await page.getByRole("radio", { name: "Income" }).click();
  await page.getByLabel("Amount").fill(amount);
  await page.getByLabel("Source").fill(source);
  await choose(page, "Category", category);
  await page.getByLabel("Date and time").fill(`${date}T12:00`);
  await page.getByRole("button", { name: "Log income" }).click();
  await expect(page.getByRole("heading", { name: "Add an entry" })).toBeHidden();
}

async function customizeDashboard(page: Page, touch = false) {
  const options = page.getByRole("button", { name: "Dashboard options" });
  if (touch) await options.tap();
  else await options.click();
  const customize = page.getByRole("menuitem", { name: "Customize dashboard" });
  if (touch) await customize.tap();
  else await customize.click();
}

async function manageDashboards(page: Page) {
  await page.getByRole("button", { name: "Dashboard options" }).click();
  await page.getByRole("menuitem", { name: "Manage dashboards" }).click();
}

async function toggleDashboardComparison(page: Page) {
  await page.getByRole("button", { name: /Reporting period:/ }).click();
  await page.getByRole("button", { name: "Compare periods" }).click();
  await page.keyboard.press("Escape");
}

async function addDashboardWidget(page: Page, title: string) {
  await customizeDashboard(page);
  await page.getByRole("button", { name: "Add widgets" }).click();
  await page.getByRole("button", { name: `Add ${title}` }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
}

test.beforeEach(async ({ context, page }) => {
  const complaints: string[] = [];
  hydrationFailures.set(page, complaints);
  page.on("pageerror", (error) => {
    const text = String(error);
    if (/hydrat|server rendered text didn't match/i.test(text)) complaints.push(text);
  });

  // Every test gets a fresh context: no IndexedDB, localStorage, cookies, auth,
  // Drive profile, or ordering dependency can leak from another test.
  await context.addInitScript(() => {
    if (sessionStorage.getItem("yaccount.e2e.storage-cleared")) return;
    localStorage.clear();
    sessionStorage.setItem("yaccount.e2e.storage-cleared", "true");
  });
});

test.afterEach(async ({ page }) => {
  expect(hydrationFailures.get(page) ?? []).toEqual([]);
});

test("opens Ledger on the first immediate tab tap", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Touch regression.");

  await page.goto("/");
  await page.getByRole("link", { name: "Ledger" }).tap();
  await expect(page).toHaveURL(/\/ledger\/?$/);
});

test("opens search from the mobile topbar", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Mobile topbar regression.");

  await openReady(page, "/", "Dashboard");
  const search = page.getByRole("button", { name: "Search yaccount" });
  await expect(search).toBeVisible();
  await search.click();
  const input = page.getByPlaceholder(/Search everything/);
  await expect(input).toBeVisible();
  await expect(input).toBeFocused();
  expect(
    await input.evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize)),
  ).toBeGreaterThanOrEqual(16);
  const dialog = page.getByRole("dialog", { name: "Search yaccount" });
  const box = await dialog.boundingBox();
  expect(box?.y ?? Infinity).toBeLessThan(80);
  await page.keyboard.press("Escape");
  await expect(input).toBeHidden();
});

test("keeps desktop search text compact", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Desktop breakpoint regression.");

  await openReady(page, "/", "Dashboard");
  await page.getByRole("button", { name: "Search yaccount" }).click();
  const input = page.getByPlaceholder(/Search everything/);
  await expect(input).toBeFocused();
  expect(
    await input.evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize)),
  ).toBe(14);
});

test("uses direct compact page identity with desktop-only context", async ({
  page,
}, testInfo) => {
  await openReady(page, "/categories", "Categories");
  const title = page.getByRole("heading", { name: "Categories", level: 1 });
  const context = page.getByText("Ledger structure", { exact: true });
  const explanation = page.getByText(
    "Rename or archive anytime — old transactions keep their label.",
    { exact: true },
  );

  if (testInfo.project.name === "mobile") {
    await expect(context).toBeHidden();
    await expect(explanation).toBeHidden();
    const titleBox = await title.boundingBox();
    const actionBox = await page
      .getByRole("button", { name: "New", exact: true })
      .boundingBox();
    expect(Math.abs((titleBox?.y ?? 0) - (actionBox?.y ?? 0))).toBeLessThan(10);
  } else {
    await expect(context).toBeVisible();
    await expect(explanation).toBeVisible();
  }
});

test("keeps Dashboard controls to two phone rows and compares inside period", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Phone hierarchy regression.");

  await openReady(page, "/", "Dashboard");
  const title = page.getByRole("heading", { name: "Dashboard", level: 1 });
  const period = page.getByRole("button", { name: /Reporting period:/ });
  const options = page.getByRole("button", { name: "Dashboard options" });
  const tabs = page.getByRole("navigation", { name: "Dashboard sets" });
  const [titleBox, periodBox, optionsBox, tabsBox] = await Promise.all([
    title.boundingBox(),
    period.boundingBox(),
    options.boundingBox(),
    tabs.boundingBox(),
  ]);

  expect(Math.abs((titleBox?.y ?? 0) - (periodBox?.y ?? 0))).toBeLessThan(10);
  expect(Math.abs((periodBox?.y ?? 0) - (optionsBox?.y ?? 0))).toBeLessThan(10);
  expect(tabsBox?.y ?? 0).toBeGreaterThan((titleBox?.y ?? 0) + 24);
  await period.click();
  await expect(page.getByRole("button", { name: "Compare periods" })).toBeVisible();
  await page.getByRole("button", { name: "Compare periods" }).click();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", {
      name: "Reporting period: Last 3 months vs Last month",
    }),
  ).toBeVisible();
  await toggleDashboardComparison(page);
  await addDashboardWidget(page, "Where it went");
  await toggleDashboardComparison(page);
  const compared = page.getByRole("heading", { name: "Where it went" });
  await expect(compared).toHaveCount(2);
  const first = await compared.nth(0).boundingBox();
  const second = await compared.nth(1).boundingBox();
  expect(second?.y ?? 0).toBeGreaterThan(first?.y ?? 0);
});

test("fits repeated Search cycles inside a synthetic keyboard viewport", async ({
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

  await openReady(page, "/", "Dashboard");
  const openSearch = page.getByRole("button", { name: "Search yaccount" });
  const input = page.getByPlaceholder(/Search everything/);
  const dialog = page.getByRole("dialog", { name: "Search yaccount" });

  for (let cycle = 0; cycle < 3; cycle++) {
    await openSearch.click();
    await expect(input).toBeFocused();
    await page.evaluate(() => {
      const viewport = window.visualViewport as VisualViewport & {
        height: number;
        offsetTop: number;
      };
      viewport.height = 360;
      viewport.offsetTop = 120;
      viewport.dispatchEvent(new Event("resize"));
      viewport.dispatchEvent(new Event("scroll"));
    });

    await expect
      .poll(async () => {
        const box = await dialog.boundingBox();
        return box
          ? { top: Math.round(box.y), bottom: Math.round(box.y + box.height) }
          : null;
      })
      .toEqual({ top: 164, bottom: 472 });
    const list = dialog.locator('[data-slot="command-list"]');
    expect(await list.evaluate((node) => getComputedStyle(node).overflowY)).toBe("auto");
    const regions = await dialog.evaluate((node) => {
      const input = node.querySelector('[data-slot="command-input-wrapper"]');
      const list = node.querySelector('[data-slot="command-list"]');
      if (!(input instanceof HTMLElement) || !(list instanceof HTMLElement)) {
        throw new Error("Search regions missing");
      }
      const dialogBox = node.getBoundingClientRect();
      const inputBox = input.getBoundingClientRect();
      const listBox = list.getBoundingClientRect();
      return {
        inputInset: Math.round(inputBox.top - dialogBox.top),
        listBottomGap: Math.round(dialogBox.bottom - listBox.bottom),
        listHeight: Math.round(listBox.height),
      };
    });
    expect(regions.inputInset).toBeLessThanOrEqual(12);
    expect(regions.listBottomGap).toBeLessThanOrEqual(8);
    expect(regions.listHeight).toBeGreaterThan(250);

    if (cycle === 0) {
      await page.mouse.click(195, 140);
    } else {
      await page.keyboard.press("Escape");
    }
    await expect(dialog).toBeHidden();
    await page.evaluate(() => {
      const viewport = window.visualViewport as VisualViewport & {
        height: number;
        offsetTop: number;
      };
      viewport.height = window.innerHeight;
      viewport.offsetTop = 0;
      viewport.dispatchEvent(new Event("resize"));
      viewport.dispatchEvent(new Event("scroll"));
    });
  }
});

test("shows Goals in mobile tabs and Inbox in the topbar", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Mobile navigation regression.");

  await openReady(page, "/", "Dashboard");
  const primary = page.getByRole("navigation", { name: "Primary" });
  await expect(primary.getByRole("link", { name: "Goals" })).toBeVisible();
  await expect(primary.getByRole("link", { name: "Inbox" })).toHaveCount(0);

  await primary.getByRole("link", { name: "Goals" }).tap();
  await expect(page).toHaveURL(/\/goals\/?$/);
  await page.getByRole("link", { name: "Inbox" }).tap();
  await expect(page).toHaveURL(/\/inbox\/?$/);
});

test("changes theme only in Settings", async ({ page }, testInfo) => {
  await openReady(page, "/settings", "Settings");
  await expect(page.getByLabel("System")).toBeVisible();
  await expect(page.getByLabel("Light")).toBeVisible();
  await expect(page.getByLabel("Dark")).toBeVisible();
  await expect(page.getByRole("button", { name: /Switch to .* theme/ })).toHaveCount(0);

  await page.getByLabel("Dark").click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByLabel("Dark")).toHaveAttribute("data-state", "on");

  await page.getByLabel("Light").click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);

  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: "More screens" }).click();
    await expect(page.getByRole("button", { name: /Switch to .* theme/ })).toHaveCount(0);
  }
});

test("coalesces keyboard resize and tracks later viewport pan", async ({
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

  await openReady(page, "/", "Dashboard");
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

  await expect
    .poll(async () => Number(await sheet.getAttribute("data-test-style-commits")))
    .toBe(commitsAfterResize + 1);
  expect(
    await sheet.evaluate((node) => ({
      inset: node.style.getPropertyValue("--kb"),
      translate: node.style.translate,
    })),
  ).toEqual({ inset: "264px", translate: "0px -44px" });
});

test("keeps a focused long-sheet field above a synthetic keyboard", async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Mobile viewport regression.");

  await context.addInitScript(() => {
    const fake = Object.assign(new EventTarget(), {
      height: 616,
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

  await openReady(page, "/recurring", "Recurring");
  await page.getByRole("button", { name: "New", exact: true }).click();
  const body = page.locator('[data-slot="sheet-body"]');
  const bottomInput = body.getByLabel("Ends (optional)");
  await bottomInput.evaluate((input) => input.focus({ preventScroll: true }));
  const before = await body.evaluate((node) => node.scrollTop);

  await page.evaluate(() => {
    const viewport = window.visualViewport as VisualViewport & {
      height: number;
      offsetTop: number;
    };
    viewport.height = 352;
    viewport.offsetTop = 196.66;
    viewport.dispatchEvent(new Event("resize"));
  });

  await expect
    .poll(() => body.evaluate((node) => node.scrollTop))
    .toBeGreaterThan(before);
  const geometry = await body.evaluate((node) => {
    const field = node.querySelector("#rr-end");
    if (!(field instanceof HTMLElement)) throw new Error("End date missing");
    return {
      bodyBottom: node.getBoundingClientRect().bottom,
      fieldBottom: field.getBoundingClientRect().bottom,
    };
  });
  expect(geometry.fieldBottom).toBeLessThanOrEqual(geometry.bodyBottom - 15);
});

test("scrolls the Quick Add heading with its fields", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Mobile sheet regression.");

  await openReady(page, "/", "Dashboard");
  await openQuickAdd(page);

  const body = page.locator('[data-slot="sheet-body"]');
  await expect(body.getByRole("heading", { name: "Add an entry" })).toBeVisible();
  await expect(
    body.getByText("Log an expense, income, or a move between containers."),
  ).toBeVisible();
  await expect(body.getByLabel("Amount")).toBeVisible();
});

test("curates a fresh Overview without empty cards", async ({ page }) => {
  await openReady(page, "/", "Dashboard");

  const brief = page
    .getByRole("heading", { name: "Money brief" })
    .locator("xpath=ancestor::*[@data-widget-size][1]");
  const recent = page
    .getByRole("heading", { name: "Recent entries" })
    .locator("xpath=ancestor::*[@data-widget-size][1]");
  await expect(brief).toHaveAttribute("data-widget-size", "expanded");
  await expect(recent).toHaveAttribute("data-widget-size", "expanded");
  for (const title of [
    "Budget triage",
    "Cash horizon",
    "Allocation plan",
    "Goal outlook",
    "Month landing",
    "What changed",
  ]) {
    await expect(page.getByRole("heading", { name: title })).toHaveCount(0);
  }
});

test("edits dashboard cards in place and commits on Done", async ({ page }) => {
  await createCategory(page, "E2E editor budget");
  await page.getByRole("button", { name: "Actions for E2E editor budget" }).click();
  await page.getByRole("menuitem", { name: "Budget" }).click();
  await page.getByLabel("Monthly amount").fill("100.00");
  await page.getByRole("button", { name: "Set budget" }).click();
  await openReady(page, "/", "Dashboard");
  await customizeDashboard(page);
  await expect(page.getByRole("button", { name: "Done" })).toBeVisible();

  const rows = page.locator("[data-widget-id]");
  await expect(rows.first()).toHaveAttribute("data-widget-id", "balance");
  await expect(page.getByRole("button", { name: "Move Overall balance" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Hide Overall balance" })).toBeVisible();

  await page.getByRole("button", { name: "Configure Recent entries" }).click();
  await page.getByRole("menuitem", { name: "Before Budget triage" }).click();
  await expect(rows.nth(2)).toHaveAttribute("data-widget-id", "recent");

  await page.getByRole("button", { name: "Hide Budget triage" }).click();
  await expect(page.locator('[data-widget-id="pace"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Budget triage" })).toBeVisible();

  await customizeDashboard(page);
  await page.getByRole("button", { name: "Configure Recent entries" }).click();
  await page.getByRole("menuitem", { name: "Before Budget triage" }).click();
  await page.getByRole("button", { name: "Hide Budget triage" }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("heading", { name: "Budget triage" })).toBeHidden();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Budget triage" })).toBeHidden();
  await toggleDashboardComparison(page);
  await expect(page.getByRole("heading", { name: "Recent entries" })).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Budget triage" })).toHaveCount(0);
  await expect(
    page.getByText("Period comparison isn't supported for this current view.", {
      exact: true,
    }),
  ).toHaveCount(3);
  await toggleDashboardComparison(page);

  await customizeDashboard(page);
  await expect(rows.nth(2)).toHaveAttribute("data-widget-id", "recent");
  await page.getByRole("button", { name: "Reset" }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.locator("h3").first()).toHaveText("Overall balance");
  await expect(page.locator("h3").nth(1)).toHaveText("Money brief");
});

test("moves, hides, and restores Overall balance like any widget", async ({ page }) => {
  await openReady(page, "/", "Dashboard");
  await customizeDashboard(page);
  await page.getByRole("button", { name: "Configure Overall balance" }).click();
  await page.getByRole("menuitem", { name: "After Money brief" }).click();
  await expect(page.locator("[data-widget-id]").nth(1)).toHaveAttribute(
    "data-widget-id",
    "balance",
  );
  await page.getByRole("button", { name: "Hide Overall balance" }).click();
  await expect(page.locator('[data-widget-id="balance"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Add widgets" }).click();
  await page.getByRole("button", { name: "Add Overall balance" }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("heading", { name: "Overall balance" })).toBeVisible();
  await page.reload();
  await expect(page.locator("[data-widget-size]").nth(1)).toContainText(
    "Overall balance",
  );
});

test("restores hidden widgets from a descriptive gallery", async ({ page }) => {
  await openReady(page, "/", "Dashboard");
  await customizeDashboard(page);
  await page.getByRole("button", { name: "Hide Recent entries" }).click();
  await page.getByRole("button", { name: "Add widgets" }).click();

  await expect(page.getByRole("heading", { name: "Add widgets" })).toBeVisible();
  await expect(
    page.getByText("The latest approved entries across the ledger."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add Recent entries" }).click();

  await expect(page.getByRole("dialog", { name: "Add widgets" })).toBeHidden();
  await expect(page.locator('[data-widget-id="recent"]')).toHaveAttribute(
    "data-highlighted",
    "",
  );
});

test("searches the grouped widget gallery by recognition language", async ({ page }) => {
  await openReady(page, "/", "Dashboard");
  await customizeDashboard(page);
  await page.getByRole("button", { name: "Hide Recent entries" }).click();
  await page.getByRole("button", { name: "Add widgets" }).click();

  await expect(page.getByRole("heading", { name: "Needs setup" })).toBeVisible();
  await page.getByRole("searchbox", { name: "Search widgets" }).fill("allowance");
  await expect(
    page.getByRole("link", { name: "Set a budget for Budget triage" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Recent entries" })).toHaveCount(0);
});

test("persists a useful compact widget mode", async ({ page }) => {
  await openReady(page, "/", "Dashboard");
  await page.getByRole("button", { name: "Configure Recent entries" }).click();
  await page.getByRole("menuitemradio", { name: "Compact" }).click();

  const recentCard = page
    .getByRole("heading", { name: "Recent entries" })
    .locator("xpath=ancestor::*[@data-widget-size][1]");
  await expect(recentCard).toHaveAttribute("data-widget-size", "compact");

  await page.reload();
  await expect(recentCard).toHaveAttribute("data-widget-size", "compact");
});

test("persists the synced Cash horizon window", async ({ page }) => {
  await createCategory(page, "E2E cash bill");
  await openReady(page, "/recurring", "Recurring");
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByLabel("Payee / source").fill("E2E future power");
  await page.getByRole("combobox", { name: "Category" }).fill("E2E cash bill");
  await page
    .getByRole("option", { name: "E2E cash bill · expense", exact: true })
    .click();
  await page.getByLabel("Amount").fill("25.00");
  await page.getByLabel("Day of month").fill("30");
  await page.getByRole("button", { name: "Add recurring" }).click();

  await openReady(page, "/", "Dashboard");
  const horizon = page
    .getByRole("heading", { name: "Cash horizon" })
    .locator("xpath=ancestor::*[@data-widget-size][1]");
  await horizon.scrollIntoViewIfNeeded();
  await horizon.getByRole("button", { name: "Configure Cash horizon" }).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  const horizonSettings = page.getByRole("dialog", { name: "Cash horizon settings" });
  await horizonSettings.getByRole("button", { name: "Forecast 60 days" }).click();
  await expect(
    horizonSettings.getByRole("button", { name: "Forecast 60 days" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");

  await page.reload();
  await horizon.scrollIntoViewIfNeeded();
  await horizon.getByRole("button", { name: "Configure Cash horizon" }).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await expect(
    horizonSettings.getByRole("button", { name: "Forecast 60 days" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(horizon.getByText("E2E future power", { exact: false })).toHaveCount(2);
});

test("adds Commitments and persists its cadence view", async ({ page }) => {
  await createCategory(page, "E2E commitment bills");
  await openReady(page, "/recurring", "Recurring");
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByLabel("Payee / source").fill("E2E internet");
  await page.getByRole("combobox", { name: "Category" }).fill("E2E commitment bills");
  await page
    .getByRole("option", { name: "E2E commitment bills · expense", exact: true })
    .click();
  await page.getByLabel("Amount").fill("65.00");
  await page.getByLabel("Day of month").fill("27");
  await page.getByRole("button", { name: "Add recurring" }).click();

  await openReady(page, "/", "Dashboard");
  await customizeDashboard(page);
  await page.getByRole("button", { name: "Add widgets" }).click();
  await page.getByRole("button", { name: "Add Commitments" }).click();
  await page.getByRole("button", { name: "Done" }).click();

  const card = page
    .getByRole("heading", { name: "Commitments" })
    .locator("xpath=ancestor::*[@data-widget-size][1]");
  await card.scrollIntoViewIfNeeded();
  await expect(card.getByLabel("Scheduled monthly load: $65.00").first()).toBeVisible();
  await expect(card.getByText("E2E internet", { exact: true })).toBeVisible();
  const configure = card.getByRole("button", { name: "Configure Commitments" });
  await configure.scrollIntoViewIfNeeded();
  await configure.click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  const commitmentSettings = page.getByRole("dialog", {
    name: "Commitments settings",
  });
  await commitmentSettings
    .getByRole("button", { name: "Show irregular commitments" })
    .click();
  await expect(
    commitmentSettings.getByRole("button", { name: "Show irregular commitments" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");

  await page.reload();
  await configure.scrollIntoViewIfNeeded();
  await configure.click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await expect(
    commitmentSettings.getByRole("button", { name: "Show irregular commitments" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(card.getByLabel("Known in the next 12 months: $0.00")).toBeVisible();
});

test("persists Allocation plan pay-cycle mode and income anchors", async ({ page }) => {
  await createCategory(page, "E2E allocation bills");
  await page.getByRole("button", { name: "Actions for E2E allocation bills" }).click();
  await page.getByRole("menuitem", { name: "Budget" }).click();
  await page.getByLabel("Monthly amount").fill("100.00");
  await page.getByRole("button", { name: "Set budget" }).click();

  await createCategory(page, "E2E allocation income", "Income");
  for (const income of [
    { source: "E2E salary", amount: "2900.00", day: "30" },
    { source: "E2E side income", amount: "100.00", day: "25" },
  ]) {
    await openReady(page, "/recurring", "Recurring");
    await page.getByRole("button", { name: "New", exact: true }).click();
    await page.getByRole("radio", { name: "Income" }).click();
    await page.getByLabel("Payee / source").fill(income.source);
    await page.getByRole("combobox", { name: "Category" }).fill("E2E allocation income");
    await page
      .getByRole("option", { name: "E2E allocation income · income", exact: true })
      .click();
    await page.getByLabel("Amount").fill(income.amount);
    await page.getByLabel("Day of month").fill(income.day);
    await page.getByRole("button", { name: "Add recurring" }).click();
  }

  await openReady(page, "/", "Dashboard");
  const allocation = page
    .getByRole("heading", { name: "Allocation plan" })
    .locator("xpath=ancestor::*[@data-widget-size][1]");
  await allocation.scrollIntoViewIfNeeded();
  await allocation.getByRole("button", { name: "Configure Allocation plan" }).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  const allocationSettings = page.getByRole("dialog", {
    name: "Allocation plan settings",
  });
  await allocationSettings.getByRole("button", { name: "Plan by pay cycle" }).click();
  await expect(
    allocationSettings.getByRole("button", { name: "Plan by pay cycle" }),
  ).toHaveAttribute("aria-pressed", "true");

  await allocationSettings.getByText("Income anchors", { exact: false }).click();
  await allocationSettings
    .getByRole("checkbox", { name: "Use E2E side income as a pay-cycle anchor" })
    .click();
  await page.keyboard.press("Escape");

  await page.reload();
  await allocation.scrollIntoViewIfNeeded();
  await allocation.getByRole("button", { name: "Configure Allocation plan" }).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await expect(
    allocationSettings.getByRole("button", { name: "Plan by pay cycle" }),
  ).toHaveAttribute("aria-pressed", "true");
  await allocationSettings.getByText("Income anchors", { exact: false }).click();
  await expect(
    allocationSettings.getByRole("checkbox", {
      name: "Use E2E side income as a pay-cycle anchor",
    }),
  ).not.toBeChecked();
});

test("shows Month landing scheduled math before history is available", async ({
  page,
}) => {
  await createCategory(page, "E2E landing bill");
  await openReady(page, "/recurring", "Recurring");
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByLabel("Payee / source").fill("E2E month-end bill");
  await page.getByRole("combobox", { name: "Category" }).fill("E2E landing bill");
  await page
    .getByRole("option", { name: "E2E landing bill · expense", exact: true })
    .click();
  await page.getByLabel("Amount").fill("125.00");
  await page.getByLabel("Day of month").fill("30");
  await page.getByRole("button", { name: "Add recurring" }).click();

  await openReady(page, "/", "Dashboard");
  await customizeDashboard(page);
  await page.getByRole("button", { name: "Add widgets" }).click();
  await page.getByRole("button", { name: "Add Month landing" }).click();
  await page.getByRole("button", { name: "Done" }).click();
  const landing = page
    .getByRole("heading", { name: "Month landing" })
    .locator("xpath=ancestor::*[@data-widget-size][1]");
  await landing.scrollIntoViewIfNeeded();
  await expect(landing.getByText("Early estimate", { exact: false })).toBeVisible();
  await landing.getByRole("button", { name: "Configure Month landing" }).click();
  await page.getByRole("menuitem", { name: "Show the math" }).click();
  await expect(
    page.getByRole("heading", { name: "Month landing: show the math" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Scheduled" })).toBeVisible();
  await expect(
    page
      .locator('[data-slot="sheet-body"]')
      .getByText("Remaining scheduled net", { exact: true }),
  ).toBeVisible();
});

test("uses complete selected months for Income resilience", async ({ page }) => {
  await createCategory(page, "E2E resilience income", "Income");
  for (const [month, amount] of [
    ["02", "950.00"],
    ["03", "1000.00"],
    ["04", "1050.00"],
    ["05", "1000.00"],
    ["06", "950.00"],
    ["07", "1050.00"],
  ]) {
    await logIncomeOn(
      page,
      "E2E steady salary",
      amount,
      "E2E resilience income",
      `2026-${month}-01`,
    );
  }

  await openReady(page, "/", "Dashboard");
  await page.getByRole("button", { name: /Reporting period:/ }).click();
  await page.getByRole("button", { name: "Last 6 months", exact: true }).click();
  await customizeDashboard(page);
  await page.getByRole("button", { name: "Add widgets" }).click();
  await page.getByRole("button", { name: "Add Income resilience" }).click();
  await page.getByRole("button", { name: "Done" }).click();
  const card = page
    .getByRole("heading", { name: "Income resilience" })
    .locator("xpath=ancestor::*[@data-widget-size][1]");
  await card.scrollIntoViewIfNeeded();
  await card.scrollIntoViewIfNeeded();
  await expect(card.getByText("last 6 complete months", { exact: true })).toBeVisible();
  await expect(card.getByText("E2E steady salary", { exact: true })).toBeVisible();
  await expect(card.getByText("steady", { exact: true })).toBeVisible();
  await card.getByRole("button", { name: "Configure Income resilience" }).click();
  await page.getByRole("menuitem", { name: "Show the math" }).click();
  await expect(
    page.getByRole("heading", { name: "Income resilience: show the math" }),
  ).toBeVisible();
  await expect(page.getByText("Typical month (median)", { exact: true })).toBeVisible();
});

test("creates repeatable Watch instances and persists an exact container floor", async ({
  page,
}) => {
  await createContainer(page, "E2E watched reserve");
  await createCategory(page, "E2E watched groceries");
  await openReady(page, "/ledger", "Overall balance");
  await logExpense(page, "E2E groceries", "54.00", "E2E watched groceries");

  await openReady(page, "/", "Dashboard");
  await customizeDashboard(page);
  await page.getByRole("button", { name: "Add widgets" }).click();
  const gallery = page.getByRole("dialog", { name: "Add widgets" });
  await choose(
    gallery.page(),
    "Choose container for Container watch",
    "E2E watched reserve",
  );
  await gallery.getByRole("button", { name: "Add Container watch" }).click();
  await page.getByRole("button", { name: "Add widgets" }).click();
  await choose(gallery.page(), "Choose container for Container watch", "General");
  await gallery.getByRole("button", { name: "Add Container watch" }).click();
  await page.getByRole("button", { name: "Add widgets" }).click();
  await choose(
    gallery.page(),
    "Choose category for Category watch",
    "E2E watched groceries",
  );
  await gallery.getByRole("button", { name: "Add Category watch" }).click();
  await page.getByRole("button", { name: "Done" }).click();

  await expect(page.getByRole("heading", { name: "Container watch" })).toHaveCount(2);
  await expect(page.getByRole("heading", { name: "Category watch" })).toHaveCount(1);
  const reserve = page
    .getByRole("heading", { name: "Container watch" })
    .nth(0)
    .locator("xpath=ancestor::*[@data-widget-size][1]");
  const general = page
    .getByRole("heading", { name: "Container watch" })
    .nth(1)
    .locator("xpath=ancestor::*[@data-widget-size][1]");
  const category = page
    .getByRole("heading", { name: "Category watch" })
    .locator("xpath=ancestor::*[@data-widget-size][1]");
  await reserve.scrollIntoViewIfNeeded();
  await expect(
    reserve.getByText("Watch: E2E watched reserve", { exact: true }),
  ).toBeVisible();
  await expect(
    reserve.getByRole("combobox", { name: "Change watched container" }),
  ).toHaveCount(0);
  await general.scrollIntoViewIfNeeded();
  await expect(general.getByText("Watch: General", { exact: true })).toBeVisible();
  await category.scrollIntoViewIfNeeded();
  await expect(
    category.getByText("Watch: E2E watched groceries", { exact: true }),
  ).toBeVisible();

  await reserve.scrollIntoViewIfNeeded();
  await reserve.getByRole("button", { name: "Configure Container watch" }).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  const watchSettings = page.getByRole("dialog", { name: "Container watch settings" });
  await expect(
    watchSettings.getByRole("combobox", { name: "Change watched container" }),
  ).toHaveText("E2E watched reserve");
  await watchSettings.getByLabel("Container floor amount").fill("-100.00");
  await watchSettings.getByRole("button", { name: "Save floor" }).click();
  await page.keyboard.press("Escape");
  await expect(reserve.getByLabel("Distance above your floor: $100.00")).toBeVisible();
  await reserve.getByRole("button", { name: "Configure Container watch" }).click();
  await page.getByRole("menuitem", { name: "Show the math" }).click();
  await expect(
    page.getByRole("heading", { name: "Container watch: show the math" }),
  ).toBeVisible();
  await expect(
    page.locator('[data-slot="sheet-body"]').getByText("User floor", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  await page.reload();
  await expect(page.getByRole("heading", { name: "Container watch" })).toHaveCount(2);
  await reserve.scrollIntoViewIfNeeded();
  await expect(
    reserve.getByText("Watch: E2E watched reserve", { exact: true }),
  ).toBeVisible();
  await expect(reserve.getByLabel("Distance above your floor: $100.00")).toBeVisible();
});

test("ranks and caps current matters in Money brief", async ({ page }) => {
  await createCategory(page, "E2E brief groceries");
  await page.getByRole("button", { name: "Actions for E2E brief groceries" }).click();
  await page.getByRole("menuitem", { name: "Budget" }).click();
  await page.getByLabel("Monthly amount").fill("100.00");
  await page.getByRole("button", { name: "Set budget" }).click();
  await openReady(page, "/ledger", "Overall balance");
  await logExpense(page, "E2E brief market", "95.00", "E2E brief groceries");

  await openReady(page, "/recurring", "Recurring");
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByLabel("Payee / source").fill("E2E due review");
  await page.getByRole("combobox", { name: "Category" }).fill("E2E brief groceries");
  await page
    .getByRole("option", { name: "E2E brief groceries · expense", exact: true })
    .click();
  await page.getByLabel("Amount").fill("10.00");
  await page.getByLabel("Day of month").fill("23");
  await page.getByLabel("Starts").fill("2026-08-23");
  await page.getByRole("button", { name: "Add recurring" }).click();
  await page.reload();
  await expect(page.getByText("E2E due review", { exact: true })).toBeVisible();

  await openReady(page, "/", "Dashboard");
  const card = page
    .getByRole("heading", { name: "Money brief" })
    .locator("xpath=ancestor::*[@data-widget-size][1]");
  await card.scrollIntoViewIfNeeded();
  await expect(card).toHaveAttribute("data-widget-size", "compact");
  await expect(card.getByText("3 need you", { exact: true })).toBeVisible();
  await expect(card.getByText(/^Cash below zero Aug \d{1,2}$/)).toBeVisible();
  await expect(card.getByText("1 pending entry", { exact: true })).toBeVisible();
  await expect(card.getByText("E2E brief groceries:", { exact: false })).toBeVisible();
  await card.getByRole("button", { name: "Configure Money brief" }).click();
  await page.getByRole("menuitem", { name: "Show the math" }).click();
  await expect(
    page.getByRole("heading", { name: "Money brief: show the math" }),
  ).toBeVisible();
  await expect(
    page.getByText("Pending entries ready to review", { exact: true }),
  ).toBeVisible();
});

test("explicitly matches a manual entry during month close", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-08-02T12:00:00-04:00"));
  await createCategory(page, "E2E close income", "Income");
  await logIncomeOn(
    page,
    "E2E salary deposit",
    "1000.00",
    "E2E close income",
    "2026-07-29",
  );

  await openReady(page, "/recurring", "Recurring");
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByRole("radio", { name: "Income" }).click();
  await page.getByLabel("Payee / source").fill("E2E salary");
  await page.getByRole("combobox", { name: "Category" }).fill("E2E close income");
  await page
    .getByRole("option", { name: "E2E close income · income", exact: true })
    .click();
  await page.getByLabel("Amount").fill("1000.00");
  await page.getByLabel("Day of month").fill("30");
  await page.getByLabel("Starts").fill("2026-07-30");
  await page.getByRole("button", { name: "Add recurring" }).click();

  await openReady(page, "/", "Dashboard");
  const card = page
    .getByRole("heading", { name: "Money brief" })
    .locator("xpath=ancestor::*[@data-widget-size][1]");
  await card.scrollIntoViewIfNeeded();
  await expect(card.getByText("Close July", { exact: true })).toBeVisible();
  await expect(
    card.getByText("1 expected occurrence is unmatched", { exact: true }),
  ).toBeVisible();
  await expect(card.getByText("E2E salary deposit", { exact: true })).toBeVisible();

  await card
    .getByRole("button", {
      name: "Use E2E salary deposit entry for E2E salary on Jul 30",
    })
    .click();
  await expect(page.getByText("Entry matched", { exact: true })).toBeVisible();
  await expect(card.getByText("Close July", { exact: true })).toBeHidden();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Money brief" })).toBeVisible();
  await expect(page.getByText("Close July", { exact: true })).toBeHidden();
  await openReady(page, "/inbox", "Inbox");
});

test("keeps lazy dashboard detail within the mobile viewport", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Mobile overflow regression.");

  await openReady(page, "/", "Dashboard");
  await expect(page.getByRole("heading", { name: "Money brief" })).toBeVisible();
  const widths = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));

  expect(widths.content).toBe(widths.viewport);
});

test("reorders dashboard widgets by touch", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Touch regression.");

  await openReady(page, "/", "Dashboard");
  await customizeDashboard(page, true);
  const recentHandle = page.getByRole("button", {
    name: "Move Recent entries",
    exact: true,
  });
  const recentBox = await recentHandle.boundingBox();
  const briefBox = await page.locator('[data-widget-id="brief"]').boundingBox();
  if (!recentBox || !briefBox) throw new Error("Dashboard cards are not visible.");
  await dragUpByTouch(
    page,
    recentHandle,
    recentBox.y + recentBox.height / 2 - (briefBox.y + briefBox.height / 2),
  );
  await expect(page.locator("[data-widget-id]").nth(1)).toHaveAttribute(
    "data-widget-id",
    "recent",
  );
});

test("manages named dashboard sets and keeps the active set local", async ({ page }) => {
  await openReady(page, "/", "Dashboard");
  await expect(
    page.getByRole("button", { name: "Overview", exact: true }),
  ).toHaveAttribute("aria-current", "page");

  await page.getByRole("button", { name: "Add dashboard" }).click();
  await expect(page.getByRole("heading", { name: "Add dashboard" })).toBeVisible();
  await page.getByLabel("Name").fill("Quarterly planning");
  await page.getByRole("radio", { name: /^Planning/ }).focus();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByRole("radio", { name: /^Empty/ })).toBeChecked();
  await page.getByRole("button", { name: "Create", exact: true }).focus();
  await page.keyboard.press("Enter");

  const quarterlyTab = page.getByRole("button", {
    name: "Quarterly planning",
    exact: true,
  });
  await expect(quarterlyTab).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Overall balance", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Budget triage" })).toHaveCount(0);

  await page.reload();
  await expect(quarterlyTab).toHaveAttribute("aria-current", "page");

  await manageDashboards(page);
  const manager = page.getByRole("dialog", { name: "Your dashboards" });
  await manager.getByRole("button", { name: "Actions for Quarterly planning" }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await page
    .getByRole("dialog", { name: "Rename dashboard" })
    .getByLabel("Name")
    .fill("Focus");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(manager.getByText("Focus", { exact: true })).toBeVisible();

  await manager.getByRole("button", { name: "Actions for Focus", exact: true }).click();
  await page.getByRole("menuitem", { name: "Duplicate" }).click();
  await expect(manager.getByText("Focus copy", { exact: true })).toBeVisible();
  await manager.getByRole("button", { name: "Move Focus copy up" }).click();
  await manager.getByRole("button", { name: "Actions for Focus copy" }).click();
  await page.getByRole("menuitem", { name: "Make default" }).click();
  await expect(manager.getByText("Default", { exact: true })).toHaveCount(1);

  await manager.getByRole("button", { name: "Actions for Focus", exact: true }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete dashboard" }).click();
  await expect(manager.getByText("Focus", { exact: true })).toHaveCount(0);

  await manager.getByRole("button", { name: "Actions for Overview" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete dashboard" }).click();
  await expect(manager.getByText("Overview", { exact: true })).toHaveCount(0);

  await manager.getByRole("button", { name: "Actions for Focus copy" }).click();
  await expect(page.getByRole("menuitem", { name: "Delete" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await manager.getByRole("button", { name: "Close" }).click();
  await expect(
    page.getByRole("button", { name: "Focus copy", exact: true }),
  ).toHaveAttribute("aria-current", "page");
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

  await openReady(page, "/", "Dashboard");
  await addDashboardWidget(page, "Where it went");
  const balance = page
    .getByRole("heading", { name: "Overall balance" })
    .locator("xpath=ancestor::*[@data-widget-size][1]");
  const breakdown = page
    .getByRole("heading", { name: "Where it went" })
    .locator("xpath=ancestor::*[@data-widget-size][1]");
  const categoryBreakdown = breakdown.getByRole("link", {
    name: /^E2E hidden stats /,
  });
  await expect(balance.getByText("-$12.34", { exact: true })).toBeVisible();
  await expect(categoryBreakdown).toContainText("$12.34");

  await openReady(page, "/categories", "Categories");
  const actions = page.getByRole("button", { name: "Actions for E2E hidden stats" });
  await actions.click();
  await page.getByRole("menuitem", { name: "Hide from stats" }).click();
  await expect(page.getByText("Hidden from stats", { exact: true })).toBeVisible();
  await actions.click();
  await expect(page.getByRole("menuitem", { name: "Show in stats" })).toBeVisible();
  await page.keyboard.press("Escape");

  await openReady(page, "/", "Dashboard");
  await expect(balance.getByText("-$12.34", { exact: true })).toBeVisible();
  await expect(categoryBreakdown).toHaveCount(0);
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

test("overflowing selects scroll by touch in independent sheets", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Touch regression.");

  for (let i = 1; i <= 12; i++) {
    await createCategory(page, `E2E scroll category ${String(i).padStart(2, "0")}`);
  }
  const last = "E2E scroll category 12";

  await page.setViewportSize({ width: 390, height: 500 });
  await openReady(page, "/ledger", "Overall balance");
  await openQuickAdd(page);
  await page.getByRole("combobox", { name: "Category" }).tap();
  let viewport = page.getByRole("listbox");
  await swipeUp(page, viewport);
  await expect.poll(() => viewport.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  await page.getByRole("option", { name: last, exact: true }).tap();
  await expect(page.getByRole("combobox", { name: "Category" })).toHaveValue(last);

  await openReady(page, "/", "Dashboard");
  await customizeDashboard(page, true);
  await page.getByRole("button", { name: "Add widgets" }).tap();
  await page.getByRole("combobox", { name: "Choose category for Category watch" }).tap();
  viewport = page.locator("[data-radix-select-viewport]");
  await swipeUp(page, viewport);
  await expect.poll(() => viewport.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  await page.getByRole("option", { name: last, exact: true }).tap();
  await expect(
    page.getByRole("combobox", { name: "Choose category for Category watch" }),
  ).toHaveText(last);
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

test("creation comboboxes search choices and recall an exact vendor", async ({
  page,
}) => {
  await createCategory(page, "E2E autocomplete dining");
  await createCategory(page, "E2E autocomplete other");
  await createCategory(page, "E2E autocomplete income", "Income");
  await createContainer(page, "E2E autocomplete card");
  await createContainer(page, "E2E autocomplete reserve");
  await openReady(page, "/ledger", "Overall balance");

  await openQuickAdd(page);
  await page.getByLabel("Amount").fill("8.25");
  await page.getByLabel("Vendor").fill("E2E exact vendor");
  await choose(page, "Category", "E2E autocomplete dining");
  await choose(page, "Container", "E2E autocomplete card");
  await page.getByRole("button", { name: "Log expense" }).click();
  await expect(page.getByText("E2E exact vendor", { exact: true })).toBeVisible();

  await openQuickAdd(page);
  const vendor = page.getByRole("combobox", { name: "Vendor" });
  await vendor.click();
  await expect(
    page.getByRole("option", { name: "E2E exact vendor", exact: true }),
  ).toBeVisible();
  await page.getByRole("option", { name: "E2E exact vendor", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Category" })).toHaveValue(
    "E2E autocomplete dining",
  );
  await expect(page.getByRole("combobox", { name: "Container" })).toHaveValue(
    "E2E autocomplete card",
  );
  await expect(page.getByLabel("Amount")).toHaveValue("");

  await vendor.fill("unknown variation");
  await expect(page.getByRole("combobox", { name: "Category" })).toHaveValue(
    "E2E autocomplete dining",
  );
  await expect(page.getByRole("combobox", { name: "Container" })).toHaveValue(
    "E2E autocomplete card",
  );

  await vendor.fill("  e2e EXACT vendor  ");
  await vendor.press("Tab");
  await expect(page.getByRole("combobox", { name: "Category" })).toHaveValue(
    "E2E autocomplete dining",
  );
  await expect(page.getByRole("combobox", { name: "Container" })).toHaveValue(
    "E2E autocomplete card",
  );

  const category = page.getByRole("combobox", { name: "Category" });
  await category.fill("other");
  await page.getByRole("option", { name: "E2E autocomplete other", exact: true }).click();
  await expect(category).toHaveValue("E2E autocomplete other");

  await page.getByRole("radio", { name: "Transfer" }).click();
  const from = page.getByRole("combobox", { name: "From container" });
  await from.fill("card");
  await page.getByRole("option", { name: "E2E autocomplete card", exact: true }).click();
  const destination = page.getByRole("combobox", { name: "To container" });
  await expect(destination).toHaveJSProperty("tagName", "BUTTON");
  await destination.click();
  await expect(
    page.getByRole("option", { name: "E2E autocomplete reserve", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("option", { name: "E2E autocomplete card", exact: true }),
  ).toBeHidden();
  await expect(page.getByLabel("Transfer label")).not.toHaveAttribute("list");
});

test("scopes investment contributions to the reporting period", async ({ page }) => {
  await openReady(page, "/containers", "Containers");
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

  await openReady(page, "/", "Dashboard");
  await addDashboardWidget(page, "Investments");
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
  await expect(page.getByRole("textbox", { name: "Vendor" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Vendor" })).toHaveCount(0);
  await expect(page.getByLabel("Vendor")).not.toHaveAttribute("list");
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
  await openReady(page, "/goals", "Goals");
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

  await openReady(page, "/goals", "Goals");
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
  await openReady(page, "/recurring", "Recurring");
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByLabel("Payee / source").fill("E2E recurring");
  await page.getByRole("combobox", { name: "Category" }).fill("E2E subscriptions");
  await page
    .getByRole("option", { name: "E2E subscriptions · expense", exact: true })
    .click();
  await page.getByLabel("Amount").fill("9.99");
  await choose(page, "Repeats", "Daily");
  await page.getByRole("button", { name: "Add recurring" }).click();

  await page.goto("/inbox");
  await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();
  const inboxBadge = page
    .getByRole("link", { name: "Inbox", exact: true })
    .locator('[aria-label="1 pending"]');
  await expect(inboxBadge).toBeVisible();
  await expect(page.getByText("E2E recurring", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Approve E2E recurring" }).click();
  await expect(page.getByText("Nothing to review", { exact: true })).toBeVisible();
  await expect(inboxBadge).toBeHidden();

  await openReady(page, "/ledger", "Overall balance");
  await expect(page.getByText("E2E recurring", { exact: true })).toBeVisible();
});

test("uses a dropdown for a new recurring transfer destination", async ({ page }) => {
  await createContainer(page, "E2E recurring reserve");
  await openReady(page, "/recurring", "Recurring");
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByRole("radio", { name: "Transfer" }).click();

  const destination = page.getByRole("combobox", { name: "To container" });
  await expect(destination).toHaveJSProperty("tagName", "BUTTON");
  await destination.click();
  await expect(
    page.getByRole("option", { name: "E2E recurring reserve", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("option", { name: "General", exact: true })).toBeHidden();
  await page.getByRole("option", { name: "E2E recurring reserve", exact: true }).click();
  await expect(destination).toHaveText("E2E recurring reserve");
});

test("new recurring recalls vendor fields while edit stays plain", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Creation wiring covered once.");

  await createCategory(page, "E2E recurring autocomplete");
  await createContainer(page, "E2E recurring card");
  await openReady(page, "/ledger", "Overall balance");
  await openQuickAdd(page);
  await page.getByLabel("Amount").fill("12.00");
  await page.getByLabel("Vendor").fill("E2E recurring known");
  await choose(page, "Category", "E2E recurring autocomplete");
  await choose(page, "Container", "E2E recurring card");
  await page.getByRole("button", { name: "Log expense" }).click();

  await openReady(page, "/recurring", "Recurring");
  await page.getByRole("button", { name: "New", exact: true }).click();
  const vendor = page.getByRole("combobox", { name: "Payee / source" });
  await vendor.click();
  await page.getByRole("option", { name: "E2E recurring known", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Category" })).toHaveValue(
    "E2E recurring autocomplete",
  );
  await expect(page.getByRole("combobox", { name: "Container" })).toHaveValue(
    "E2E recurring card",
  );
  await expect(page.getByLabel("Amount")).toHaveValue("");
  await page.getByLabel("Amount").fill("14.00");
  await page.getByRole("button", { name: "Add recurring" }).click();

  await page.getByRole("button", { name: "Actions for E2E recurring known" }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  await expect(page.getByRole("heading", { name: "Edit recurring" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Payee / source" })).toHaveValue(
    "E2E recurring known",
  );
  await expect(page.getByRole("combobox", { name: "Payee / source" })).toHaveCount(0);
});

test("views the monthly plan", async ({ page }) => {
  await openReady(page, "/plan", "Plan");

  await expect(page.getByRole("heading", { name: "Income expected" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Allowances" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Goal asks" })).toBeVisible();
  await expect(page.getByText("Unallocated", { exact: true })).toBeVisible();
});

async function openPalette(page: Page) {
  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.getByPlaceholder(/Search everything/)).toBeVisible();
}

test("records an investment value from search", async ({ page }) => {
  await openReady(page, "/containers", "Containers");
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByLabel("Name").fill("E2E command investment");
  await page.getByRole("radio", { name: "Investment", exact: true }).click();
  await page.getByRole("button", { name: "Create container" }).click();
  // A click dispatches the async submit but does not await its IndexedDB commit.
  // Observe the created row before navigating so a busy four-worker run cannot
  // tear down the page while the write is still in flight.
  await expect(
    page.getByRole("button", { name: "Actions for E2E command investment" }),
  ).toBeVisible();

  await openReady(page, "/", "Dashboard");
  await openPalette(page);
  await page
    .getByRole("option", {
      name: /Record investment value.*E2E command investment/,
    })
    .click();

  const sheet = page.getByRole("dialog", { name: "Reported balances" });
  await expect(sheet).toBeVisible();
  await page.getByLabel("Reported value").fill("321.45");
  await page.getByRole("button", { name: "Save report" }).click();
  await expect(sheet.getByText("$321.45", { exact: true })).toBeVisible();
});

test("shows common and recent command actions", async ({ page }) => {
  await openReady(page, "/", "Dashboard");
  await openPalette(page);
  await expect(page.getByText("Common actions", { exact: true })).toBeVisible();
  await expect(page.getByText("Go to", { exact: true })).toHaveCount(0);

  await page.getByRole("option", { name: "Log income", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Add an entry" })).toBeVisible();
  await page.keyboard.press("Escape");

  await openPalette(page);
  await expect(page.getByText("Recent actions", { exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: "Log income", exact: true })).toHaveCount(
    1,
  );
  await page.keyboard.press("Escape");

  await page.reload();
  await expect(page.getByText("Dashboard", { exact: true })).toBeVisible();
  await openPalette(page);
  await expect(page.getByText("Recent actions", { exact: true })).toBeVisible();
  await page.getByPlaceholder(/Search everything/).fill("settings");
  await expect(page.getByText("Go to", { exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: /Settings/ })).toBeVisible();
});

test("keeps common actions usable when command history storage is blocked", async ({
  page,
  context,
}) => {
  await context.addInitScript(() => {
    const getItem = Storage.prototype.getItem;
    const setItem = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key: string) {
      if (this === window.localStorage && key === "yaccount.command.history") {
        throw new DOMException("Storage blocked", "SecurityError");
      }
      return getItem.call(this, key);
    };
    Storage.prototype.setItem = function (key: string, value: string) {
      if (this === window.localStorage && key === "yaccount.command.history") {
        throw new DOMException("Storage blocked", "SecurityError");
      }
      return setItem.call(this, key, value);
    };
  });

  await openReady(page, "/", "Dashboard");
  await openPalette(page);
  await expect(page.getByText("Common actions", { exact: true })).toBeVisible();
  await page.getByRole("option", { name: "Log income", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Add an entry" })).toBeVisible();
  await page.keyboard.press("Escape");

  await openPalette(page);
  await expect(page.getByText("Common actions", { exact: true })).toBeVisible();
  await expect(page.getByText("Recent actions", { exact: true })).toHaveCount(0);
});

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

  await openReady(page, "/", "Dashboard");
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
  await openReady(page, "/", "Dashboard");

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
  await openReady(page, "/", "Dashboard");
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
  await openReady(page, "/", "Dashboard");
  const fab = page.getByRole("button", { name: "Log a transaction" });
  await fab.focus();
  await page.keyboard.down("Enter");
  await page.waitForTimeout(FAB_HOLD_PAST_THRESHOLD_MS);
  await page.keyboard.up("Enter");

  await expect(page.getByRole("menu", { name: "Quick actions" })).toBeVisible();
  await expect(page.getByText("No saved transaction shortcuts yet.")).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Log a craving win" })).toBeVisible();
});

test("separates FAB quick press, hold chooser, and movement cancellation", async ({
  page,
}) => {
  await openReady(page, "/", "Dashboard");
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
  await expect(page.getByRole("menu", { name: "Quick actions" })).toBeVisible();
  await page.mouse.up();
  await page.keyboard.press("Escape");

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 11, y);
  await page.waitForTimeout(FAB_HOLD_PAST_THRESHOLD_MS);
  await page.mouse.up();
  await expect(page.getByRole("menu", { name: "Quick actions" })).toBeHidden();

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
  await expect(page.getByRole("menu", { name: "Quick actions" })).toBeHidden();
});

test("supports FAB keyboard hold and Escape cancellation", async ({ page }) => {
  await openReady(page, "/", "Dashboard");
  const fab = page.getByRole("button", { name: "Log a transaction" });

  await fab.focus();
  await page.keyboard.down("Enter");
  await page.waitForTimeout(FAB_HOLD_PAST_THRESHOLD_MS);
  await expect(page.getByRole("menu", { name: "Quick actions" })).toBeVisible();
  await page.keyboard.up("Enter");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu", { name: "Quick actions" })).toBeHidden();
  await expect(fab).toBeFocused();

  await page.keyboard.down(" ");
  await page.waitForTimeout(200);
  await page.keyboard.press("Escape");
  await page.keyboard.up(" ");
  await expect(page.getByRole("menu", { name: "Quick actions" })).toBeHidden();

  await page.keyboard.down(" ");
  await page.waitForTimeout(FAB_HOLD_PAST_THRESHOLD_MS);
  await page.keyboard.up(" ");
  await expect(page.getByRole("menuitem", { name: "Log a craving win" })).toBeFocused();
});

test("opens the FAB chooser from a touch hold", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "touch project only");
  await openReady(page, "/", "Dashboard");
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
  await expect(page.getByRole("menu", { name: "Quick actions" })).toBeVisible();
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
  await expect(page.getByRole("menu", { name: "Quick actions" })).toBeHidden();
});

test("keeps FAB geometry and shows a compact money-add mark", async ({
  page,
}, testInfo) => {
  await openReady(page, "/", "Dashboard");

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

  await openReady(page, "/settings", "Settings");

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

  await openReady(page, "/settings", "Settings");
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
  await openReady(page, "/settings", "Settings");

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
  await openReady(page, "/categories", "Categories");
  await expect(page.getByText("E2E keep me", { exact: true })).toBeVisible();
});

test("clear-all cannot be triggered by accident", async ({ page }) => {
  await createCategory(page, "E2E clear me");
  await openReady(page, "/ledger", "Overall balance");
  await logExpense(page, "E2E doomed", "4.50", "E2E clear me");

  await openReady(page, "/settings", "Settings");
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
  await openReady(page, "/categories", "Categories");
  await expect(page.getByText("E2E clear me", { exact: true })).toBeHidden();
});

test("clear-all can be abandoned without touching anything", async ({ page }) => {
  await createCategory(page, "E2E survivor");
  await openReady(page, "/settings", "Settings");

  await page.getByRole("button", { name: "Clear everything", exact: true }).click();
  const confirm = page.getByRole("alertdialog");
  await confirm.getByRole("textbox").fill("erase");
  await confirm.getByRole("button", { name: "Keep it" }).click();
  await expect(confirm).toBeHidden();

  await openReady(page, "/categories", "Categories");
  await expect(page.getByText("E2E survivor", { exact: true })).toBeVisible();
});
