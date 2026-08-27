import { describe, expect, it } from "vitest";
import { createChangeNonce } from "./change-nonce";

describe("Ledger change nonce", () => {
  it("is monotonic even for changes in the same millisecond", () => {
    const next = createChangeNonce();
    expect([next(), next(), next()]).toEqual([1, 2, 3]);
  });
});
