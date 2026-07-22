"use client";

import { useTheme } from "next-themes";
import { MoonIcon, SunIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Light ⇄ dark. Lives in the top bar on every width, and again in the More
 * sheet, where a phone user's hand actually is. */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn("text-muted-foreground rounded-full", className)}
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
    >
      <SunIcon className="hidden size-4 dark:block" />
      <MoonIcon className="block size-4 dark:hidden" />
    </Button>
  );
}
