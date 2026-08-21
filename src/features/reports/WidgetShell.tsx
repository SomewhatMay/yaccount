"use client";

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
import { rangeText, type WidgetContext, type WidgetDef } from "./registry";

/**
 * One widget on the dashboard: its panel, its fold, its window, and the blast
 * radius when it breaks.
 *
 * Everything here is keyed on the widget's stable `id`, which is why the registry
 * insists on one. The fold and the per-widget period override are stored per id
 * (`prefs.ts`, device-local — how you like to read a report is not a fact about
 * your money), and the `ErrorBoundary` is named after the widget so a chart that
 * trips over an unexpected shape costs you that chart and not the screen.
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

export function DashboardWidget({ def, base }: { def: WidgetDef; base: WidgetContext }) {
  const [openPref, setOpenPref] = useLocalPref(openKey(def.id), "open", isOpenState);
  const [windowPref, setWindowPref] = useLocalPref(
    windowKey(def.id),
    FOLLOW,
    isWindowPref,
  );

  // A widget whose window is fixed by its meaning ignores any stored override —
  // "budget pace" is about this month whatever a stale preference says.
  const override: ReportingPeriod | null =
    def.fixedWindow || windowPref === FOLLOW ? null : decodePeriod(windowPref);
  const range: DateRange = override ? resolvePeriod(override, base.today) : base.range;
  const ctx: WidgetContext = override ? { ...base, range } : base;

  const body = (
    <ErrorBoundary label={def.title} resetKeys={[range.start, range.end]}>
      {def.render(ctx)}
    </ErrorBoundary>
  );

  // The hero and the KPI strip are the screen's opening statement, not panels:
  // no chrome, nothing to fold, and no window of their own to choose.
  if (def.bare) return body;

  const open = openPref === "open";
  return (
    <Collapsible
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

      <CollapsibleContent className="pt-4">{body}</CollapsibleContent>
    </Collapsible>
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
