"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSetAtom } from "jotai";
import { SearchIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SyncIndicator } from "@/features/SyncIndicator";
import { AuthButton } from "@/features/auth/AuthButton";
import { ThemeToggle } from "@/features/shell/ThemeToggle";
import { commandPaletteAtom } from "@/features/store";
import { destinationFor } from "@/features/shell/nav";

/**
 * The bar above the reading column. It carries identity and status, nothing you
 * navigate with — that is the rail's job on a desktop and the tab bar's on a
 * phone.
 *
 * On a phone it is the wordmark plus the two ambient states (sync, theme); the
 * account control moves into the More sheet, where there is room for a sentence
 * about what signing in does. From `lg` it names the screen you are on and adds
 * the ⌘K affordance — discoverability for a shortcut nobody guesses.
 *
 * Sticky, because sync status is the one thing you may want to check mid-scroll.
 */
export function TopBar({ maxWidth }: { maxWidth: string }) {
  const pathname = usePathname();
  const openPalette = useSetAtom(commandPaletteAtom);
  const here = destinationFor(pathname);

  return (
    <header className="bg-background/85 sticky top-0 z-30 border-b backdrop-blur">
      <div className={cn("mx-auto flex h-14 items-center gap-2 px-5", maxWidth)}>
        <Link href="/" className="flex items-center gap-2 lg:hidden">
          <span className="bg-primary size-2.5 rounded-full" aria-hidden />
          <span className="font-display text-lg leading-none font-semibold tracking-tight">
            yaccount
          </span>
        </Link>

        <span className="text-muted-foreground hidden text-sm font-medium lg:inline">
          {here?.label ?? ""}
        </span>

        <div className="ml-auto flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openPalette(true)}
            className="text-muted-foreground hidden rounded-full lg:inline-flex"
            aria-label="Search and jump to a screen"
          >
            <SearchIcon className="size-4" />
            <kbd className="text-muted-foreground/80 font-mono text-[0.6875rem]">⌘K</kbd>
          </Button>
          <AuthButton signedOutOnly />
          <SyncIndicator />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
