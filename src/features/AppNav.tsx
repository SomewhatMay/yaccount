"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { MoonIcon, SunIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const LINKS = [
  { href: "/", label: "Ledger" },
  { href: "/containers", label: "Containers" },
  { href: "/categories", label: "Categories" },
] as const;

export function AppNav() {
  const pathname = usePathname();
  return (
    <header className="flex items-center gap-2 py-5">
      <Link href="/" className="mr-2 flex items-center gap-2">
        <span className="bg-primary size-2.5 rounded-full" aria-hidden />
        <span className="font-display text-lg leading-none font-semibold tracking-tight">
          yaccount
        </span>
      </Link>
      <nav className="flex items-center gap-0.5">
        {LINKS.map((l) => {
          const active = pathname === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
      <ThemeToggle />
    </header>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  return (
    <Button
      variant="ghost"
      size="icon"
      className="text-muted-foreground ml-auto rounded-full"
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
    >
      <SunIcon className="hidden size-4 dark:block" />
      <MoonIcon className="block size-4 dark:hidden" />
    </Button>
  );
}
