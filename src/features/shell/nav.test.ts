import { describe, it, expect } from "vitest";
import {
  DESTINATIONS,
  MORE_DESTINATIONS,
  TAB_SLOTS,
  TOPBAR_DESTINATIONS,
  activeTab,
  destinationFor,
  normalizePathname,
  tabSlotState,
} from "@/features/shell/nav";

/**
 * The shell's destination registry. It is plain data on purpose: the bottom tab
 * bar, the desktop rail, the More sheet and the ⌘K palette all read the SAME
 * list, so a screen can never exist on one surface and be unreachable on
 * another. That invariant is what these tests hold.
 */

describe("DESTINATIONS — every screen the app has", () => {
  it("lists all ten routes exactly once", () => {
    expect(DESTINATIONS.map((d) => d.href)).toEqual([
      "/",
      "/ledger",
      "/inbox",
      "/plan",
      "/goals",
      "/cravings",
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
    expect(destinationFor("/ledger/")?.label).toBe("Ledger");
    expect(destinationFor("/nope")).toBeUndefined();
  });
});

describe("normalizePathname", () => {
  it("removes trailing slashes without changing root", () => {
    expect(normalizePathname("/")).toBe("/");
    expect(normalizePathname("/ledger/")).toBe("/ledger");
  });
});

describe("TAB_SLOTS — locked by user feedback (2026-08-24)", () => {
  it("is exactly Home · Ledger · Goals · More, in that order", () => {
    expect(TAB_SLOTS.map((t) => t.label)).toEqual(["Home", "Ledger", "Goals", "More"]);
  });

  it("routes the first three and opens a sheet for the fourth", () => {
    expect(TAB_SLOTS.slice(0, 3).map((t) => t.href)).toEqual(["/", "/ledger", "/goals"]);
    expect(TAB_SLOTS[3].href).toBeUndefined();
  });

  it("does not put Inbox's pending badge on another tab", () => {
    expect(TAB_SLOTS.some((t) => "badge" in t)).toBe(false);
  });
});

describe("TOPBAR_DESTINATIONS — always one tap away", () => {
  it("holds Inbox and nothing else", () => {
    expect(TOPBAR_DESTINATIONS.map((d) => d.href)).toEqual(["/inbox"]);
  });
});

describe("MORE_DESTINATIONS — what compact direct navigation displaces", () => {
  it("holds every destination that is not a tab route", () => {
    expect(MORE_DESTINATIONS.map((d) => d.href)).toEqual([
      "/plan",
      "/cravings",
      "/recurring",
      "/containers",
      "/categories",
      "/settings",
    ]);
  });

  it("loses nothing: tabs ∪ topbar ∪ More = every destination", () => {
    const tabbed = TAB_SLOTS.map((t) => t.href).filter((h): h is string => Boolean(h));
    const reachable = new Set([
      ...tabbed,
      ...TOPBAR_DESTINATIONS.map((d) => d.href),
      ...MORE_DESTINATIONS.map((d) => d.href),
    ]);
    expect(reachable.size).toBe(DESTINATIONS.length);
    for (const d of DESTINATIONS) expect(reachable.has(d.href)).toBe(true);
  });
});

describe("activeTab — which slot lights up", () => {
  it("marks a tab's own route", () => {
    expect(activeTab("/")).toBe("/");
    expect(activeTab("/ledger")).toBe("/ledger");
    expect(activeTab("/ledger/")).toBe("/ledger");
    expect(activeTab("/goals")).toBe("/goals");
  });

  it("marks More for anything reached through it", () => {
    // Routes stay stable at every breakpoint (locked), so /plan is a real screen
    // on a phone — the tab bar has to say how you got there.
    expect(activeTab("/plan")).toBe("more");
    expect(activeTab("/plan/")).toBe("more");
    expect(activeTab("/settings")).toBe("more");
  });

  it("marks no bottom slot for Inbox in the topbar", () => {
    expect(activeTab("/inbox")).toBeNull();
  });

  it("marks nothing for a route the shell does not know", () => {
    expect(activeTab("/whatever")).toBeNull();
  });
});

describe("tabSlotState", () => {
  it("gives current state priority over pending state", () => {
    expect(tabSlotState({ current: false, pending: false })).toBe("idle");
    expect(tabSlotState({ current: false, pending: true })).toBe("pending");
    expect(tabSlotState({ current: true, pending: false })).toBe("active");
    expect(tabSlotState({ current: true, pending: true })).toBe("active");
  });
});
