import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const quickAdd = readFileSync(
  new URL("../shell/QuickAddSheet.tsx", import.meta.url),
  "utf8",
);
const recurring = readFileSync(
  new URL("../recurring/RecurringRuleSheet.tsx", import.meta.url),
  "utf8",
);

it("uses non-editable dropdowns for every predefined creation entity", () => {
  expect(quickAdd).not.toContain("CreationEntityCombobox");
  expect(quickAdd).toContain("CreationTextCombobox");
  expect(quickAdd).toContain("<Select value={f.toContainerId}");
  expect(quickAdd).toContain('<SelectTrigger aria-label="To container"');

  expect(recurring).not.toContain("CreationEntityCombobox");
  expect(recurring).toContain("CreationTextCombobox");
  expect(recurring).toContain("<ContainerSelect\n              value={toId}");
});
