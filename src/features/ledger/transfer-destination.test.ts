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

it("uses non-editable dropdowns for transfer destinations", () => {
  expect(quickAdd).toContain("<Select value={f.toContainerId}");
  expect(quickAdd).toContain('<SelectTrigger aria-label="To container"');
  expect(quickAdd).not.toMatch(/<CreationEntityCombobox\s+value=\{f\.toContainerId\}/);

  expect(recurring).toContain("<ContainerSelect\n              value={toId}");
  expect(recurring).not.toMatch(/<CreationEntityCombobox\s+value=\{toId\}/);
});
