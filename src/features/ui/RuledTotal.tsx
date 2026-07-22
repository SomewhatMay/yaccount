"use client";

import { Money, type MoneyTone } from "@/features/ui/Money";
import { cn } from "@/lib/utils";

/**
 * A total, under a rule.
 *
 * The hairline is the whole point: in a ledger a rule is punctuation meaning
 * "this sums the above". Never draw one anywhere else — a divider that
 * sometimes means addition and sometimes means nothing teaches the reader to
 * ignore it. A `grand` total takes the double rule: the accounting convention
 * for the line nothing further is added to.
 */
export function RuledTotal({
  label,
  cents,
  tone = "neutral",
  emphasis = "sub",
  className,
}: {
  label: string;
  cents: number;
  tone?: MoneyTone;
  emphasis?: "sub" | "grand";
  className?: string;
}) {
  const grand = emphasis === "grand";
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4 pt-2",
        grand ? "rule-double mt-2" : "rule mt-1",
        className,
      )}
    >
      <span className={cn(grand ? "eyebrow text-foreground" : "text-sm font-medium")}>
        {label}
      </span>
      <Money
        cents={cents}
        tone={tone}
        className={cn(grand ? "figure-md" : "text-sm font-medium")}
      />
    </div>
  );
}
