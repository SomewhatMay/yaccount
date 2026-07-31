"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAtomValue } from "jotai";
import { cn } from "@/lib/utils";
import { pendingCountAtom } from "@/features/store";
import {
  DESTINATIONS,
  destinationFor,
  normalizePathname,
} from "@/features/shell/nav";
import { AuthButton } from "@/features/auth/AuthButton";

/** Settings sits apart from the ledger's screens — it is where you go when
 * something needs attention, not one of the places you keep accounts. */
const SETTINGS = destinationFor("/settings")!;

/**
 * The desktop rail (≥ lg). Every destination, always visible — a wide screen has
 * no reason to hide six of them behind a sheet, so the phone's More list simply
 * unfolds here.
 *
 * The current screen uses a quiet iris plate as well as full-strength text, so
 * selected state remains obvious at a glance.
 */
export function SidebarRail() {
  const pathname = usePathname();
  const activeHref = normalizePathname(pathname);
  const pending = useAtomValue(pendingCountAtom);

  return (
    <aside className="bg-sidebar fixed inset-y-0 left-0 z-40 hidden w-56 flex-col border-r lg:flex">
      <Link href="/" className="flex items-center gap-2 px-5 py-5">
        <span className="bg-primary size-2.5 rounded-full" aria-hidden />
        <span className="font-display text-lg leading-none font-semibold tracking-tight">
          yaccount
        </span>
      </Link>

      <nav aria-label="Primary" className="flex-1 overflow-y-auto px-2.5 py-2">
        <ul className="space-y-0.5">
          {DESTINATIONS.filter((d) => d.href !== SETTINGS.href).map((d) => (
            <RailLink
              key={d.href}
              href={d.href}
              label={d.label}
              icon={d.icon}
              current={activeHref === d.href}
              badge={d.href === "/inbox" ? pending : 0}
            />
          ))}
        </ul>
      </nav>

      <div className="space-y-2 border-t px-2.5 py-3">
        <ul>
          <RailLink
            href={SETTINGS.href}
            label={SETTINGS.label}
            icon={SETTINGS.icon}
            current={activeHref === SETTINGS.href}
            badge={0}
          />
        </ul>
        <div className="px-1.5">
          <AuthButton />
        </div>
      </div>
    </aside>
  );
}

function RailLink({
  href,
  label,
  icon: Icon,
  current,
  badge,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  current: boolean;
  badge: number;
}) {
  return (
    <li>
      <Link
        href={href}
        aria-current={current ? "page" : undefined}
        className={cn(
          "flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium transition-colors duration-[var(--dur-1)]",
          "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
          current
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:text-foreground hover:bg-accent/60",
        )}
      >
        <Icon className="size-4 shrink-0" />
        <span className="truncate">{label}</span>
        {badge > 0 && (
          <span
            className="bg-primary text-primary-foreground tnum ml-auto inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-mono text-[10px] leading-none"
            aria-label={`${badge} pending`}
          >
            {badge}
          </span>
        )}
      </Link>
    </li>
  );
}
