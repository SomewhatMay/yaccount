import { describe, it, expect } from "vitest";
import { pickPref, readPref, writePref } from "./prefs";

const SORTS = ["newest", "oldest"] as const;
type Sort = (typeof SORTS)[number];
const isSort = (v: string): v is Sort => (SORTS as readonly string[]).includes(v);

describe("pickPref — deciding what a stored preference is worth", () => {
  it("takes a stored value the app still recognises", () => {
    expect(pickPref("oldest", "newest", isSort)).toBe("oldest");
  });

  it("falls back when nothing is stored", () => {
    expect(pickPref(null, "newest", isSort)).toBe("newest");
    expect(pickPref("", "newest", isSort)).toBe("newest");
  });

  it("falls back on a value this version no longer knows", () => {
    // A preference written by a newer build, or edited by hand, must not be able
    // to put the UI into a state it has no code for.
    expect(pickPref("by-vibes", "newest", isSort)).toBe("newest");
  });
});

describe("readPref / writePref — storage is a convenience, never a dependency", () => {
  it("returns the fallback where there is no storage at all (SSR, or blocked)", () => {
    // Prerender and private-browsing hit this path; both must render, not throw.
    expect(readPref("yaccount.test.sort", "newest", isSort)).toBe("newest");
  });

  it("writing without storage is a no-op rather than a crash", () => {
    expect(() => writePref("yaccount.test.sort", "oldest")).not.toThrow();
  });
});
