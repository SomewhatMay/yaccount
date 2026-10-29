import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { focusHref, readFocus } from "./focus-link";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

/**
 * The ledger has carried a `?focus=` for a while (`ledger/deep-link.ts`); search
 * results need the same thing on four more screens, so the plain half of it
 * lives here where all five can share one spelling.
 */
describe("focusHref / readFocus — one row, named in the URL", () => {
  it("points a screen at one row", () => {
    expect(focusHref("/categories", "c_groc")).toBe("/categories?focus=c_groc");
  });

  it("round-trips", () => {
    const href = focusHref("/goals", "g_1");
    expect(readFocus(href.slice(href.indexOf("?") + 1))).toBe("g_1");
  });

  it("escapes an id that would otherwise break the query string", () => {
    const href = focusHref("/recurring", "a b&c=d");
    expect(readFocus(href.slice(href.indexOf("?") + 1))).toBe("a b&c=d");
  });

  it("is just the screen when there is nothing to focus", () => {
    expect(focusHref("/containers", "")).toBe("/containers");
  });

  it("reads nothing out of a query that names nothing", () => {
    expect(readFocus("")).toBeNull();
    expect(readFocus("sort=name")).toBeNull();
    expect(readFocus("focus=")).toBeNull();
  });
});

/**
 * A search result that lands nowhere is not a result. The repo has no
 * `@testing-library/react`, so — as `usage-ranking.test.ts` does — the wiring is
 * asserted by reading the source.
 */
describe("every screen ⌘K can point at reads the param", () => {
  it.each([
    ["./categories/CategoriesView.tsx", '"/categories"'],
    ["./containers/ContainersView.tsx", '"/containers"'],
    ["./goals/GoalsView.tsx", '"/goals"'],
    ["./recurring/RecurringView.tsx", '"/recurring"'],
  ])("%s answers a focus link", (path, route) => {
    const contents = source(path);
    expect(contents).toContain("useFocusParam");
    expect(contents).toContain(`useFocusParam(${route}`);
  });

  it("opens the sheet only where a sheet is the right landing", () => {
    // Goals and Recurring have real edit sheets. Categories and Containers have
    // an inline rename field, and opening one uninvited is how a search renames
    // the category you were only looking for.
    expect(source("./goals/GoalsView.tsx")).toContain("setSheet(found)");
    expect(source("./recurring/RecurringView.tsx")).toContain("setSheet(found)");
    expect(source("./categories/CategoriesView.tsx")).not.toContain("setEditing(true)\n  })");
    expect(source("./containers/ContainersView.tsx")).not.toContain("setEditing(true)\n  })");
  });

  it("routes palette results through the engine's ranking, not the register's order", () => {
    const palette = source("./shell/CommandPalette.tsx");
    expect(palette).toContain("buildSearchIndex");
    expect(palette).toContain("createSession");
    expect(palette).toContain("focusHref");
    // The old palette sorted the whole register on every data change.
    expect(palette).not.toContain("sortForRegister");
  });
});
