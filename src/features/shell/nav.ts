import {
  ClipboardListIcon,
  HomeIcon,
  InboxIcon,
  ListIcon,
  MoreHorizontalIcon,
  RepeatIcon,
  SettingsIcon,
  TagsIcon,
  TargetIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react";

/**
 * Where the app can take you — one list, read by all navigation surfaces: the
 * bottom tab bar, topbar, desktop rail, More sheet and ⌘K palette.
 *
 * Keeping it as data rather than four hand-laid JSX blobs is the point. A screen
 * added to one surface and forgotten on another is unreachable on that surface,
 * and on a phone that means unreachable full stop.
 *
 * Routes are stable at every breakpoint (locked, 2026-07-22): the same URL shows
 * the same screen on a phone and on a desktop. Only the chrome around it moves.
 */
export type Destination = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** What the screen is for — the palette's second line, the More sheet's. */
  hint: string;
};

export const DESTINATIONS: Destination[] = [
  { href: "/", label: "Home", icon: HomeIcon, hint: "Dashboard and charts" },
  { href: "/ledger", label: "Ledger", icon: ListIcon, hint: "Every entry, newest first" },
  { href: "/inbox", label: "Inbox", icon: InboxIcon, hint: "Occurrences awaiting you" },
  {
    href: "/plan",
    label: "Plan",
    icon: ClipboardListIcon,
    hint: "Give every dollar a purpose",
  },
  { href: "/goals", label: "Goals", icon: TargetIcon, hint: "What you're saving toward" },
  {
    href: "/recurring",
    label: "Recurring",
    icon: RepeatIcon,
    hint: "Scheduled transactions",
  },
  {
    href: "/containers",
    label: "Containers",
    icon: WalletIcon,
    hint: "Wallets, accounts and pots",
  },
  {
    href: "/categories",
    label: "Categories",
    icon: TagsIcon,
    hint: "Budgets by category",
  },
  {
    href: "/settings",
    label: "Settings",
    icon: SettingsIcon,
    hint: "Appearance, account, diagnostics",
  },
];

/** Next's trailing-slash redirects must not affect selected navigation state. */
export function normalizePathname(pathname: string): string {
  return pathname === "/" ? pathname : pathname.replace(/\/+$/, "");
}

export function destinationFor(pathname: string): Destination | undefined {
  const normalized = normalizePathname(pathname);
  return DESTINATIONS.find((d) => d.href === normalized);
}

/**
 * The four thumb slots, locked by user feedback (2026-08-24): Home · Ledger ·
 * Goals · More. Inbox and its live count moved into the topbar, opening the
 * third thumb slot for Goals.
 *
 * The fourth slot has no `href`: it opens a sheet, so nothing is a dead end.
 */
export type TabSlot = {
  label: string;
  icon: LucideIcon;
  href?: string;
};

export const TAB_SLOTS: TabSlot[] = [
  { label: "Home", icon: HomeIcon, href: "/" },
  { label: "Ledger", icon: ListIcon, href: "/ledger" },
  { label: "Goals", icon: TargetIcon, href: "/goals" },
  { label: "More", icon: MoreHorizontalIcon },
];

/** Destinations kept directly visible in the compact topbar. */
export const TOPBAR_DESTINATIONS: Destination[] = DESTINATIONS.filter(
  (d) => d.href === "/inbox",
);

/** Everything the compact tabs and topbar displace — the More sheet's contents. */
export const MORE_DESTINATIONS: Destination[] = DESTINATIONS.filter(
  (d) =>
    !TAB_SLOTS.some((t) => t.href === d.href) &&
    !TOPBAR_DESTINATIONS.some((t) => t.href === d.href),
);

/**
 * Which slot lights up for a route: its own href, or `"more"` for a screen you
 * reached through the More sheet. Saying nothing at all on `/plan` would leave
 * the bar claiming you are nowhere.
 */
export function activeTab(pathname: string): string | null {
  const normalized = normalizePathname(pathname);
  const tab = TAB_SLOTS.find((t) => t.href === normalized);
  if (tab?.href) return tab.href;
  return MORE_DESTINATIONS.some((d) => d.href === normalized) ? "more" : null;
}

export function tabSlotState({
  current,
  pending,
}: {
  current: boolean;
  pending: boolean;
}): "active" | "pending" | "idle" {
  if (current) return "active";
  return pending ? "pending" : "idle";
}
