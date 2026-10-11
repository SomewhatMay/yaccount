import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("click-to-edit cards", () => {
  it.each([
    "../ledger/LedgerView.tsx",
    "../goals/GoalsView.tsx",
    "../cravings/CravingsView.tsx",
    "../containers/ContainersView.tsx",
  ])("opens the editor when the card body is clicked (%s)", (path) => {
    expect(source(path)).toContain("activateCardOnClick(event, onEdit)");
  });
});
