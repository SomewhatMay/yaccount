"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAtomValue, useSetAtom } from "jotai";
import { SearchIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { SyncIndicator } from "@/features/SyncIndicator";
import { AuthButton } from "@/features/auth/AuthButton";
import { commandPaletteAtom, pendingCountAtom } from "@/features/store";
import { destinationFor, TOPBAR_DESTINATIONS } from "@/features/shell/nav";

const INBOX = TOPBAR_DESTINATIONS[0];

/**
 * The bar above the reading column. It carries identity and status, nothing you
 * navigate with — that is the rail's job on a desktop and the tab bar's on a
 * phone.
 *
 * On a phone it is the wordmark plus ambient states and global search; the
 * account control moves into the More sheet, where there is room for a sentence
 * about what signing in does. From `lg` it also names the screen you are on and
 * spells out the ⌘K shortcut.
 *
 * Sticky, because sync status is the one thing you may want to check mid-scroll.
 */
export function TopBar({ maxWidth }: { maxWidth: string }) {
  const pathname = usePathname();
  const openPalette = useSetAtom(commandPaletteAtom);
  const pending = useAtomValue(pendingCountAtom);
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
          <AuthButton signedOutOnly />
          <SyncIndicator />
          <Link
            href={INBOX.href}
            aria-label={INBOX.label}
            aria-current={here?.href === INBOX.href ? "page" : undefined}
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon" }),
              "text-muted-foreground relative rounded-full",
            )}
          >
            <INBOX.icon className="size-4" aria-hidden />
            {pending > 0 && (
              <span
                className="bg-primary text-primary-foreground tnum absolute -top-0.5 -right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-mono text-[10px] leading-none"
                aria-label={`${pending} pending`}
              >
                {pending}
              </span>
            )}
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openPalette(true)}
            className="text-muted-foreground rounded-full"
            aria-label="Search yaccount"
          >
            <SearchIcon className="size-4" />
            <kbd className="text-muted-foreground/80 hidden font-mono text-[0.6875rem] lg:inline">
              ⌘K
            </kbd>
          </Button>
        </div>
      </div>
    </header>
  );
}
