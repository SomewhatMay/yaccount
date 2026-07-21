"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Sign } from "@/features/ledger/amount";

/**
 * The direction of the money, made visible (§5.4 soft sign rule). It starts on
 * the category's usual direction — out for an expense, in for income — and one
 * tap flips it, which is how a refund or rebate gets logged against an expense
 * category. Money in reads emerald; money out stays quiet (§12.2).
 */
export function SignToggle({
  sign,
  onChange,
  className,
}: {
  sign: Sign;
  onChange: (next: Sign) => void;
  className?: string;
}) {
  const out = sign === "-";
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={
        out ? "Money out — switch to money in" : "Money in — switch to money out"
      }
      title={out ? "Money out" : "Money in (refund, rebate, credit)"}
      onClick={() => onChange(out ? "+" : "-")}
      className={cn(
        "tnum size-8 rounded-lg font-mono text-base",
        out ? "text-muted-foreground" : "text-positive",
        className,
      )}
    >
      {out ? "−" : "+"}
    </Button>
  );
}
