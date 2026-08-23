"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import {
  PERIOD_PRESETS,
  resolvePeriod,
  type DateRange,
  type ReportingPeriod,
} from "@/core/engine";
import { cn } from "@/lib/utils";
import { ErrorBoundary } from "@/features/ErrorBoundary";
import { useLocalPref } from "@/features/prefs";
import { Marginalia, RowActions } from "@/features/ui";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { decodePeriod, encodePeriod } from "./period-pref";
import { PRESET_LABEL, periodLabel } from "./PeriodPicker";
import {
  rangeText,
  type WidgetAvailability,
  type WidgetContext,
  type WidgetDef,
} from "./registry";
import { ShowMathSheet } from "./ShowMathSheet";

/**
 * One widget on the dashboard: its panel, its fold, its window, and the blast
 * radius when it breaks.
 *
 * Everything here is keyed on the widget's stable `id`, which is why the registry
 * insists on one. Fold state and per-widget periods are browser-local. The named
 * `ErrorBoundary` limits a rendering failure to its widget.
 */

const OPEN_STATES = ["open", "closed"] as const;
type OpenState = (typeof OPEN_STATES)[number];

/** `useLocalPref` stores strings, so "is it open" is a word, not a boolean —
 *  and never a `useState` synced in an effect, which this repo's ESLint forbids. */
function isOpenState(value: string): value is OpenState {
  return (OPEN_STATES as readonly string[]).includes(value);
}

/** A widget either follows the dashboard's period or carries its own (§6.1). */
const FOLLOW = "global";

function isWindowPref(value: string): value is string {
  return value === FOLLOW || decodePeriod(value) !== null;
}

function openKey(id: string): string {
  return `yaccount.dashboard.open.${id}`;
}
function windowKey(id: string): string {
  return `yaccount.dashboard.window.${id}`;
}

export function DashboardWidget({
  instanceId,
  size,
  def,
  base,
  editing = false,
  comparisonUnsupported = false,
  surfaceId = instanceId,
}: {
  instanceId: string;
  size: "compact" | "expanded";
  def: WidgetDef;
  base: WidgetContext;
  editing?: boolean;
  comparisonUnsupported?: boolean;
  surfaceId?: string;
}) {
  const [mathOpen, setMathOpen] = useState(false);
  const [openPref, setOpenPref] = useLocalPref(openKey(instanceId), "open", isOpenState);
  const [windowPref, setWindowPref] = useLocalPref(
    windowKey(instanceId),
    FOLLOW,
    isWindowPref,
  );

  // A widget whose window is fixed by its meaning ignores any stored override —
  // "budget pace" is about this month whatever a stale preference says.
  const override: ReportingPeriod | null =
    def.fixedWindow || windowPref === FOLLOW ? null : decodePeriod(windowPref);
  const range: DateRange = override ? resolvePeriod(override, base.today) : base.range;
  const ctx: WidgetContext = override ? { ...base, range } : base;

  const availability = def.availability?.(ctx) ?? { status: "ready" as const };
  const render = size === "compact" && def.renderCompact ? def.renderCompact : def.render;
  const body =
    availability.status === "ready" ? (
      <ErrorBoundary label={def.title} resetKeys={[range.start, range.end]}>
        {render(ctx)}
      </ErrorBoundary>
    ) : (
      renderAvailabilityState(availability)
    );
  const math = availability.status === "ready" ? def.math?.(ctx) : null;
  const content = (
    <>
      {body}
      {comparisonUnsupported && (
        <Marginalia className="mt-3 text-xs">
          <span>Period comparison isn&apos;t supported for this current view.</span>
        </Marginalia>
      )}
      {math && (
        <div className="mt-3 flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setMathOpen(true)}
          >
            Show the math
          </Button>
        </div>
      )}
      {math && (
        <ShowMathSheet
          open={mathOpen}
          onOpenChange={setMathOpen}
          title={def.title}
          idPrefix={surfaceId}
          disclosure={math}
        />
      )}
    </>
  );

  // Edit mode keeps the report visible while its ordinary controls stand down.
  // The editor supplies one shared card frame and movement controls around it.
  if (editing) return <div className="p-5">{content}</div>;

  // The hero and the KPI strip are the screen's opening statement, not panels:
  // no chrome, nothing to fold, and no window of their own to choose.
  if (def.bare) return <div data-widget-size={size}>{content}</div>;

  const open = openPref === "open";
  return (
    <Collapsible
      data-widget-size={size}
      open={open}
      onOpenChange={(next) => setOpenPref(next ? "open" : "closed")}
      className="bg-card group rounded-2xl border p-5 [contain-intrinsic-size:auto_4rem] [content-visibility:auto]"
    >
      <div className="flex items-center gap-2">
        <CollapsibleTrigger className="group/w flex min-w-0 flex-1 items-center gap-2 text-left">
          <h3 className="font-display truncate text-base font-semibold tracking-tight">
            {def.title}
          </h3>
          <ChevronDownIcon
            className="text-muted-foreground size-4 shrink-0 transition-transform duration-[var(--dur-1)] ease-[var(--ease-register)] group-data-[state=open]/w:rotate-180"
            aria-hidden
          />
        </CollapsibleTrigger>
        {!def.fixedWindow && (
          <WindowMenu title={def.title} value={windowPref} onChange={setWindowPref} />
        )}
      </div>

      {/* A widget looking at a different window than the rest of the page has to
          say so, or its numbers read as a contradiction of the ones above it. */}
      {override && (
        <Marginalia className="mt-1 text-xs">
          {periodLabel(override)} · {rangeText(range)}
        </Marginalia>
      )}

      <CollapsibleContent className={cn("pt-4", size === "compact" && "pt-3")}>
        {content}
      </CollapsibleContent>
    </Collapsible>
  );
}

function renderAvailabilityState(
  availability: Exclude<WidgetAvailability, { status: "ready" }>,
) {
  const label = {
    "needs-setup": "Needs setup",
    "insufficient-data": "More history needed",
    empty: "No data yet",
  }[availability.status];
  return (
    <div role="status" className="border-rule rounded-xl border border-dashed p-4">
      <p className="text-brand text-xs font-semibold tracking-[0.12em] uppercase">
        {label}
      </p>
      <h4 className="mt-1 font-medium">{availability.title}</h4>
      <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
        {availability.description}
      </p>
      <Button asChild variant="outline" size="sm" className="mt-3">
        <Link href={availability.action.href}>{availability.action.label}</Link>
      </Button>
    </div>
  );
}

/**
 * The per-widget window (§6.1's "optional per-widget override").
 *
 * Presets only, deliberately: a pair of date inputs inside a dropdown is a menu
 * that can't be dismissed by clicking an option, and the dashboard's own picker
 * already carries custom dates for the case that needs them.
 */
function WindowMenu({
  title,
  value,
  onChange,
}: {
  title: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <RowActions
      label={`${title}: choose a period`}
      className={cn(value !== FOLLOW && "opacity-100")}
    >
      <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
        Show this widget for
      </DropdownMenuLabel>
      <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
        <DropdownMenuRadioItem value={FOLLOW}>The dashboard period</DropdownMenuRadioItem>
        <DropdownMenuSeparator />
        {PERIOD_PRESETS.map((preset) => (
          <DropdownMenuRadioItem
            key={preset}
            value={encodePeriod({ kind: "preset", preset })}
          >
            {PRESET_LABEL[preset]}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </RowActions>
  );
}
