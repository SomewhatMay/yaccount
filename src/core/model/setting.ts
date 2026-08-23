import { z } from "zod";

/**
 * App settings (M3). Not one of the seven ledger tables (§7) — a small key/value
 * store for user preferences that must follow the user across devices, so it
 * rides the op-log like any other mutation (`setting.set`, entity-LWW by `key`)
 * rather than living in device-local `app_meta` (which is never synced, §8.4).
 * Values are strings; encode anything richer as JSON at the edge.
 */
export const SettingSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
});
export type Setting = z.infer<typeof SettingSchema>;

/** Known setting keys. */
export const SETTING = {
  /** Default Spending Container (§5.2) — what the compose bar picks by default. */
  defaultContainerId: "default_container_id",
  /** Dashboard widget order and visibility. */
  dashboardLayout: "dashboard_layout",
} as const;

export type SettingKey = (typeof SETTING)[keyof typeof SETTING];

export function makeSetting(key: string, value: string): Setting {
  return SettingSchema.parse({ key, value });
}
