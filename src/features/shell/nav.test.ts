import { describe, it, expect } from "vitest";
import {
  DESTINATIONS,
  MORE_DESTINATIONS,
  TAB_SLOTS,
  activeTab,
  destinationFor,
} from "@/features/shell/nav";

/**
 * The shell's destination registry. It is plain data on purpose: the bottom tab
 * bar, the desktop rail, the More sheet and the ⌘K palette all read the SAME
 * list, so a screen can never exist on one surface and be unreachable on
 * another. That invariant is what these tests hold.
 */

describe("DESTINATIONS — every screen the app has", () => {
  it("lists all nine routes exactly once", () => {
    expect(DESTINATIONS.map((d) => d.href)).toEqual([
      "/",
      "/ledger",
      "/inbox",
      "/plan",
      "/goals",
      "/recurring",
      "/containers",
      "/categories",
      "/settings",
    ]);
  });

  it("gives every destination a label and an icon", () => {
    for (const d of DESTINATIONS) {
      expect(d.label.length).toBeGreaterThan(0);
      expect(d.icon).toBeTruthy();
    }
  });

  it("resolves a pathname to its destination", () => {
    expect(destinationFor("/ledger")?.label).toBe("Ledger");
    expect(destinationFor("/nope")).toBeUndefined();
  });
});

describe("TAB_SLOTS — locked by the user (2026-07-22)", () => {
  it("is exactly Home · Ledger · Inbox · More, in that order", () => {
    expect(TAB_SLOTS.map((t) => t.label)).toEqual(["Home", "Ledger", "Inbox", "More"]);
  });

  it("routes the first three and opens a sheet for the fourth", () => {
    expect(TAB_SLOTS.slice(0, 3).map((t) => t.href)).toEqual(["/", "/ledger", "/inbox"]);
    expect(TAB_SLOTS[3].href).toBeUndefined();
  });

  it("puts the pending badge on Inbox, not on More", () => {
    // Inbox took the third slot precisely because it carries a live count; a
    // badge on "More" would be a number with no subject.
    expect(TAB_SLOTS.filter((t) => t.badge).map((t) => t.label)).toEqual(["Inbox"]);
  });
});

describe("MORE_DESTINATIONS — what the four slots displace", () => {
  it("holds every destination that is not a tab route", () => {
    expect(MORE_DESTINATIONS.map((d) => d.href)).toEqual([
      "/plan",
      "/goals",
      "/recurring",
      "/containers",
      "/categories",
      "/settings",
    ]);
  });

  it("loses nothing: tabs ∪ More = every destination", () => {
    const tabbed = TAB_SLOTS.map((t) => t.href).filter((h): h is string => Boolean(h));
    const reachable = new Set([...tabbed, ...MORE_DESTINATIONS.map((d) => d.href)]);
    expect(reachable.size).toBe(DESTINATIONS.length);
    for (const d of DESTINATIONS) expect(reachable.has(d.href)).toBe(true);
  });
});

describe("activeTab — which slot lights up", () => {
  it("marks a tab's own route", () => {
    expect(activeTab("/")).toBe("/");
    expect(activeTab("/ledger")).toBe("/ledger");
    expect(activeTab("/inbox")).toBe("/inbox");
  });

  it("marks More for anything reached through it", () => {
    // Routes stay stable at every breakpoint (locked), so /plan is a real screen
    // on a phone — the tab bar has to say how you got there.
    expect(activeTab("/plan")).toBe("more");
    expect(activeTab("/goals")).toBe("more");
    expect(activeTab("/settings")).toBe("more");
  });

  it("marks nothing for a route the shell does not know", () => {
    expect(activeTab("/whatever")).toBeNull();
  });
});
