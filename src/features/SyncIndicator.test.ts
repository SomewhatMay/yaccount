import { describe, expect, it } from "vitest";
import { SYNC_ATTENTION_CLASS } from "@/features/SyncIndicator";

describe("SyncIndicator attention state", () => {
  it("uses a solid red treatment with readable light and dark theme text", () => {
    expect(SYNC_ATTENTION_CLASS).toContain("bg-destructive");
    expect(SYNC_ATTENTION_CLASS).toContain("text-white");
    expect(SYNC_ATTENTION_CLASS).toContain("dark:bg-destructive");
    expect(SYNC_ATTENTION_CLASS).toContain("dark:text-background");
  });
});
