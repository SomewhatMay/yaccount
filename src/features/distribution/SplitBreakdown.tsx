"use client";

import { InfoIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Eyebrow, Money } from "@/features/ui";
import { cn } from "@/lib/utils";
import { condenseLines, type SplitLine } from "./lines";

/**
 * Where an income goes, line by line (plans/income-distribution.md): each part
 * with its share and cents, then the rest, then the ruled total. The same block
 * serves the compose ⓘ, the ledger ⓘ, the Inbox and the inline split a filtered
 * register shows — so a split reads the same everywhere it appears.
 *
 * `highlight` marks the lines a filter matched (iris tint + dot), so a parent
 * row that surfaced through one of its pieces says why it's on screen. A
 * highlighted split of more than three lines shows only the first line and the
 * match, then "…" for the lines the filter didn't touch.
 */
export function SplitBreakdown({
  lines,
  total,
  highlight,
  note,
  className,
}: {
  lines: SplitLine[];
  total: number;
  highlight?: ReadonlySet<string>;
  note?: string | null;
  className?: string;
}) {
  const shown = condenseLines(lines, highlight);
  return (
    <div className={cn("text-sm", className)} data-testid="split-breakdown">
      <ul className="space-y-0.5">
        {shown.lines.map((line) => {
          const lit = highlight?.has(line.containerId) ?? false;
          return (
            <li
              key={`${line.containerId}:${line.rest ? "rest" : "part"}`}
              data-highlighted={lit || undefined}
              className={cn(
                "flex items-baseline gap-2 rounded-md px-1.5 py-1",
                lit ? "bg-primary/10" : highlight ? "text-muted-foreground" : "",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "size-1.5 shrink-0 -translate-y-px rounded-full",
                  lit ? "bg-primary" : "bg-transparent",
                )}
              />
              <span className="min-w-0 flex-1 truncate">{line.name}</span>
              <span className="text-muted-foreground tnum shrink-0 font-mono text-xs">
                {line.share}
              </span>
              <Money
                cents={line.amount}
                tone={line.amount < 0 ? "alert" : "neutral"}
                className="w-24 shrink-0 text-right text-xs"
              />
            </li>
          );
        })}
        {shown.hidden > 0 && (
          <li
            data-testid="split-hidden"
            className="text-muted-foreground flex items-baseline gap-2 px-1.5 py-1 text-xs"
          >
            <span aria-hidden className="size-1.5 shrink-0" />
            <span aria-hidden>…</span>
            <span>
              {shown.hidden} more {shown.hidden === 1 ? "split" : "splits"}
            </span>
          </li>
        )}
      </ul>
      <div className="mt-1 flex items-baseline justify-between border-t px-1.5 pt-1.5">
        <span className="text-muted-foreground text-xs">Total</span>
        <Money cents={total} className="text-xs font-medium" />
      </div>
      {note && <p className="text-muted-foreground mt-1.5 px-1.5 text-xs">{note}</p>}
    </div>
  );
}

/**
 * The ⓘ beside "split N ways" / "distributing via …": opens the breakdown.
 * Clicks inside are kept to the popover — it can sit on a clickable register
 * row, and React bubbles portal events through the component tree.
 */
export function SplitInfo({
  lines,
  total,
  note,
  title,
  className,
}: {
  lines: SplitLine[];
  total: number;
  note?: string | null;
  title: string;
  className?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="How this income is split"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "text-muted-foreground hover:text-primary focus-visible:ring-ring inline-flex size-5 shrink-0 items-center justify-center rounded-full align-middle focus-visible:ring-2 focus-visible:outline-none",
            className,
          )}
        >
          <InfoIcon className="size-3.5" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72" onClick={(e) => e.stopPropagation()}>
        <Eyebrow as="h3" className="px-1.5">
          {title}
        </Eyebrow>
        <SplitBreakdown lines={lines} total={total} note={note} />
      </PopoverContent>
    </Popover>
  );
}
