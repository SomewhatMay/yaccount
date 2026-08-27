import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./store.ts", import.meta.url), "utf8");

describe("CravingWin UI cache wiring", () => {
  it("loads the synced store into a dedicated atom during every refresh", () => {
    expect(source).toContain("export const cravingWinsAtom = atom<CravingWin[]>([])");
    expect(source).toContain("repo.getAll<CravingWin>(STORE.cravingWins)");
    expect(source).toContain("set(cravingWinsAtom, cravingWins)");
  });
});
