"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const THEMES = [
  { value: "system", label: "System", icon: MonitorIcon },
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
] as const;

/** Hydration is the only transition; the theme provider owns later changes. */
const subscribeNothing = () => () => {};

/** Device appearance. It stays in next-themes/localStorage rather than the
 * synced financial settings journal. */
export function AppearancePanel() {
  const { theme, setTheme } = useTheme();
  const hydrated = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-display text-lg tracking-tight">Appearance</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Follow this device or keep yaccount light or dark.
        </p>
      </div>

      <div className="bg-card flex flex-col gap-4 rounded-2xl border p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium">Theme</p>
          <p className="text-muted-foreground mt-1 text-xs">
            System changes with your device setting.
          </p>
        </div>
        <ToggleGroup
          type="single"
          value={hydrated ? (theme ?? "system") : "system"}
          onValueChange={(value) => value && setTheme(value)}
          variant="outline"
          spacing={0}
          aria-label="Theme"
        >
          {THEMES.map(({ value, label, icon: Icon }) => (
            <ToggleGroupItem key={value} value={value} aria-label={label}>
              <Icon className="size-4" aria-hidden />
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    </section>
  );
}
