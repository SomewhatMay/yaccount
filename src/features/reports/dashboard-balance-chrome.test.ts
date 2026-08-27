import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { DASHBOARD_WIDGETS } from "./registry";

it("registers Overall balance as a standard widget", () => {
  const balance = DASHBOARD_WIDGETS.find((widget) => widget.id === "balance");

  expect(balance?.bare).not.toBe(true);
});

it("renders the balance figure inside the widget title without a duplicate label", () => {
  const source = readFileSync(
    new URL("./legacy-widget-renderers.tsx", import.meta.url),
    "utf8",
  );

  expect(source).toContain("showLabel={false}");
});
