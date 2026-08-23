import { describe, it, expect } from "vitest";
import { makeSetting, SettingSchema, SETTING } from "./setting";

describe("settings (M3 — synced preferences)", () => {
  it("pins the Default Spending Container key (§5.2)", () => {
    // The key is on the wire in every synced setting.set op — renaming it
    // silently orphans the preference on every other device.
    expect(SETTING.defaultContainerId).toBe("default_container_id");
  });

  it("pins the dashboard layout key", () => {
    expect(SETTING.dashboardLayout).toBe("dashboard_layout");
  });

  it("builds a key/value row", () => {
    expect(makeSetting(SETTING.defaultContainerId, "general")).toEqual({
      key: "default_container_id",
      value: "general",
    });
  });

  it("rejects an empty key but allows an empty value (a cleared preference)", () => {
    expect(() => makeSetting("", "general")).toThrow();
    expect(makeSetting(SETTING.defaultContainerId, "").value).toBe("");
  });

  it("requires both fields to be present (nullable ≠ optional on replay)", () => {
    expect(() => SettingSchema.parse({ key: "k" })).toThrow();
    expect(() => SettingSchema.parse({ key: "k", value: 7 })).toThrow();
  });
});
