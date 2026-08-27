import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Op } from "@/core/oplog";
import { operationLogFacts } from "./strategic-logging";

describe("strategic logging", () => {
  it("reduces write intents to operation types and count", () => {
    const operations = [
      {
        type: "transaction.create",
        payload: { row: { amount: 123_45, vendor_source: "Private shop" } },
      },
      {
        type: "category.update",
        payload: { row: { name: "Private category" } },
      },
      {
        type: "transaction.create",
        payload: { row: { amount: 999_99 } },
      },
    ] as unknown as Op[];

    const facts = operationLogFacts(operations);
    expect(facts).toEqual({
      count: 3,
      types: ["category.update", "transaction.create"],
    });
    expect(JSON.stringify(facts)).not.toMatch(/12345|99999|Private/);
  });

  it("wires only meaningful app phases", () => {
    const source = readFileSync(new URL("../features/store.ts", import.meta.url), "utf8");
    for (const message of [
      "write started",
      "write succeeded",
      "sync started",
      "sync succeeded",
      "data replacement started",
      "data replacement succeeded",
      "app boot started",
      "app boot succeeded",
    ]) {
      expect(source).toContain(`\"${message}\"`);
    }
    expect(source).not.toMatch(/log\.(?:debug|info|warn|error)\([^\n]*payload/);
  });
});
