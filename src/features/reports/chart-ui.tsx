"use client";

import { formatCents } from "@/core/money";

/**
 * Chart palette — semantic tokens only (§12.2), read as CSS variables so charts
 * follow light/dark automatically. Income is the one emerald accent; expenses stay
 * neutral (the norm); savings gets the single iris spark; true-negative is rose.
 * Category segments use `categoryDotColor` (the one swatch scheme), never these.
 */
export const CHART = {
  income: "var(--positive)",
  expense: "var(--muted-foreground)",
  savings: "var(--brand)",
  budget: "var(--brand)",
  negative: "var(--destructive)",
  grid: "var(--border)",
  axis: "var(--muted-foreground)",
} as const;

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]; // prettier-ignore

/** "2026-07" → "Jul" (or "Jul '26" when a year disambiguates the axis). */
export function monthLabel(key: string, withYear = false): string {
  const [y, m] = key.split("-").map(Number);
  const name = MONTHS[m - 1] ?? key;
  return withYear ? `${name} '${String(y).slice(2)}` : name;
}

/** Compact money for a chart axis: $1.2k, $340. */
export function formatAxisCents(c: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
    style: "currency",
    currency: "USD",
  }).format(c / 100);
}

interface TooltipItem {
  name?: string;
  value?: number | string;
  color?: string;
  fill?: string;
  dataKey?: string | number;
  payload?: { tipColor?: string; tipValue?: number };
}
interface MoneyTooltipProps {
  active?: boolean;
  payload?: TooltipItem[];
  label?: string;
}

/** Shared tooltip: amounts in mono, a color dot per series, quiet card surface. */
export function MoneyTooltip({ active, payload, label }: MoneyTooltipProps) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p) => p.dataKey !== "base"); // hide the waterfall's transparent base
  if (!rows.length) return null;
  return (
    <div className="bg-popover rounded-lg border px-3 py-2 text-xs shadow-md">
      {label != null && <div className="text-foreground mb-1.5 font-medium">{label}</div>}
      <div className="space-y-1">
        {rows.map((p, i) => {
          const value = typeof p.value === "number" ? p.value : Number(p.value ?? 0);
          return (
            <div key={i} className="flex items-center gap-2">
              <span
                className="size-2 rounded-full"
                style={{ background: p.payload?.tipColor ?? p.color ?? p.fill }}
              />
              {p.name && <span className="text-muted-foreground">{p.name}</span>}
              <span className="tnum text-foreground ml-auto pl-4 font-mono">
                {formatCents(value)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** A titled dashboard panel — the soft card surface every widget sits on (§12.4). */
export function Panel({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`bg-card rounded-2xl border p-5 ${className ?? ""}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="font-display text-base font-semibold tracking-tight">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Quiet empty state inside a Panel — an invitation, not a dead end (§12.6). */
export function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground py-10 text-center text-sm">{children}</p>;
}
