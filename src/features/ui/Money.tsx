"use client";

import { formatCents } from "@/core/money";
import { cn } from "@/lib/utils";

/**
 * An amount. Mono, tabular, so columns of money line up like a register (§12.3).
 *
 * The tone is always chosen by the caller, never inferred from the sign: §12.2
 * reserves emerald for money genuinely coming IN. A positive number can be a
 * refund, a transfer leg or a balance, and colouring those green would turn the
 * one meaningful accent into decoration.
 */
export type MoneyTone = "neutral" | "in" | "quiet" | "alert";

const TONE: Record<MoneyTone, string> = {
  neutral: "",
  in: "text-positive",
  quiet: "text-muted-foreground",
  alert: "text-destructive",
};

export function Money({
  cents,
  tone = "neutral",
  absolute = false,
  showPlus = false,
  className,
  ...props
}: {
  cents: number;
  tone?: MoneyTone;
  /** Drop the sign — for a transfer, where direction is carried by the arrow. */
  absolute?: boolean;
  /** Lead a gain with "+". For deltas, where the direction is the point. */
  showPlus?: boolean;
} & Omit<React.ComponentProps<"span">, "children">) {
  const value = absolute ? Math.abs(cents) : cents;
  return (
    <span className={cn("tnum font-mono", TONE[tone], className)} {...props}>
      {showPlus && value > 0 ? "+" : ""}
      {formatCents(value)}
    </span>
  );
}
