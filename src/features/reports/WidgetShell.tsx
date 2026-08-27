"use client";

import Link from "next/link";
import { Suspense, useEffect, useState, type LazyExoticComponent } from "react";
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
import { Marginalia, ResponsiveSheet, RowActions } from "@/features/ui";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenuItem,
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
  type WidgetRenderer,
} from "./registry";
import { ShowMathSheet } from "./ShowMathSheet";

/**
 * One widget on the dashboard: its panel, its fold, its window, and the blast
 * radius when it breaks.
 *
 * Browser-local fold and period preferences use the stable instance ID, so two
 * configured instances never overwrite each other. The named `ErrorBoundary`
 * limits a rendering failure to its widget.
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
  onSizeChange,
  onHide,
}: {
  instanceId: string;
  size: "compact" | "expanded";
  def: WidgetDef;
  base: WidgetContext;
  editing?: boolean;
  comparisonUnsupported?: boolean;
  surfaceId?: string;
  onSizeChange?: (size: "compact" | "expanded") => void | Promise<void>;
  onHide?: () => void | Promise<void>;
}) {
  const [mathOpen, setMathOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
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
  const open = openPref === "open";
  const active = editing || Boolean(def.bare) || open;

  const availability = active
    ? (def.availability?.(ctx) ?? { status: "ready" as const })
    : { status: "ready" as const };
  const render = size === "compact" && def.renderCompact ? def.renderCompact : def.render;
  const component =
    size === "compact" && def.compactComponent ? def.compactComponent : def.component;
  const body = !active ? null : availability.status === "ready" ? (
    <ErrorBoundary label={def.title} resetKeys={[range.start, range.end]}>
      {render ? (
        render(ctx)
      ) : component ? (
        <DeferredWidgetContent
          title={def.title}
          Renderer={component}
          context={ctx}
          immediate={editing || Boolean(def.bare) || size === "compact"}
        />
      ) : (
        <p role="alert">{def.title} has no renderer.</p>
      )}
    </ErrorBoundary>
  ) : (
    renderAvailabilityState(availability)
  );
  const hasMath = Boolean(def.math);
  const hasSettings = Boolean(def.renderSettings || def.settingsComponent);
  const supportsCompact = Boolean(def.renderCompact || def.compactComponent);
  const math = hasMath && mathOpen ? def.math?.(ctx) : null;
  const content = (
    <>
      {body}
      {comparisonUnsupported && (
        <Marginalia className="mt-3 text-xs">
          <span>Period comparison isn&apos;t supported for this current view.</span>
        </Marginalia>
      )}
    </>
  );

  // Edit mode keeps the report visible while its ordinary controls stand down.
  // The editor supplies one shared card frame and movement controls around it.
  if (editing) return <div className="p-4 sm:p-5">{content}</div>;

  // The hero and the KPI strip are the screen's opening statement, not panels:
  // no chrome, nothing to fold, and no window of their own to choose.
  if (def.bare) return <div data-widget-size={size}>{content}</div>;

  return (
    <Collapsible
      data-widget-size={size}
      open={open}
      onOpenChange={(next) => setOpenPref(next ? "open" : "closed")}
      className={cn(
        "bg-card group rounded-2xl border p-4 sm:p-5",
        "[contain-intrinsic-size:auto_4rem] [content-visibility:auto]",
      )}
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
        {WidgetMenu({
          def,
          size,
          windowPref,
          supportsCompact,
          hasMath,
          hasSettings,
          onWindowChange: setWindowPref,
          onSizeChange,
          onShowMath: () => setMathOpen(true),
          onShowSettings: () => setSettingsOpen(true),
          onHide,
        })}
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
      {math && (
        <ShowMathSheet
          open={mathOpen}
          onOpenChange={setMathOpen}
          title={def.title}
          idPrefix={surfaceId}
          disclosure={math}
        />
      )}
      {hasSettings && (
        <ResponsiveSheet
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          title={`${def.title} settings`}
          description="Changes apply to this widget only."
        >
          <div className="px-4 pb-5">
            {settingsOpen &&
              (def.renderSettings ? (
                def.renderSettings(ctx)
              ) : def.settingsComponent ? (
                <DeferredWidgetContent
                  title={`${def.title} settings`}
                  Renderer={def.settingsComponent}
                  context={ctx}
                  immediate
                />
              ) : null)}
          </div>
        </ResponsiveSheet>
      )}
    </Collapsible>
  );
}

function DeferredWidgetContent({
  title,
  Renderer,
  context,
  immediate,
}: {
  title: string;
  Renderer: LazyExoticComponent<WidgetRenderer>;
  context: WidgetContext;
  immediate: boolean;
}) {
  const browserWithoutObserver =
    typeof window !== "undefined" && !("IntersectionObserver" in window);
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [nearViewport, setNearViewport] = useState(immediate || browserWithoutObserver);

  useEffect(() => {
    if (immediate || nearViewport || !node || !("IntersectionObserver" in window)) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setNearViewport(true);
        observer.disconnect();
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [immediate, nearViewport, node]);

  if (!nearViewport) {
    return (
      <div ref={setNode} className="min-h-20 min-w-0" aria-busy="true">
        <span className="sr-only">Loading {title}</span>
      </div>
    );
  }

  return (
    <div ref={setNode} className="min-w-0">
      <Suspense
        fallback={
          <div className="min-h-20" aria-busy="true">
            <span className="sr-only">Loading {title}</span>
          </div>
        }
      >
        <Renderer {...context} />
      </Suspense>
    </div>
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

/** One title menu for display size, widget settings, math, and period override. */
function WidgetMenu({
  def,
  size,
  windowPref,
  supportsCompact,
  hasMath,
  hasSettings,
  onWindowChange,
  onSizeChange,
  onShowMath,
  onShowSettings,
  onHide,
}: {
  def: WidgetDef;
  size: "compact" | "expanded";
  windowPref: string;
  supportsCompact: boolean;
  hasMath: boolean;
  hasSettings: boolean;
  onWindowChange: (value: string) => void;
  onSizeChange?: (size: "compact" | "expanded") => void | Promise<void>;
  onShowMath: () => void;
  onShowSettings: () => void;
  onHide?: () => void | Promise<void>;
}) {
  const canChooseSize = supportsCompact && Boolean(onSizeChange);
  const hasOtherActions = canChooseSize || hasMath || hasSettings || !def.fixedWindow;
  if (!hasOtherActions && !onHide) return null;
  return (
    <RowActions label={`Configure ${def.title}`} className="opacity-100">
      {hasSettings && (
        <DropdownMenuItem onSelect={onShowSettings}>Settings</DropdownMenuItem>
      )}
      {hasMath && (
        <DropdownMenuItem onSelect={onShowMath}>Show the math</DropdownMenuItem>
      )}
      {(hasSettings || hasMath) && (canChooseSize || !def.fixedWindow) && (
        <DropdownMenuSeparator />
      )}
      {canChooseSize && (
        <>
          <DropdownMenuLabel>Size</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={size}
            onValueChange={(value) =>
              void onSizeChange?.(value === "compact" ? "compact" : "expanded")
            }
          >
            <DropdownMenuRadioItem value="compact">Compact</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="expanded">Expanded</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </>
      )}
      {canChooseSize && !def.fixedWindow && <DropdownMenuSeparator />}
      {!def.fixedWindow && (
        <>
          <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
            Show this widget for
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup value={windowPref} onValueChange={onWindowChange}>
            <DropdownMenuRadioItem value={FOLLOW}>
              The dashboard period
            </DropdownMenuRadioItem>
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
        </>
      )}
      {onHide && (
        <>
          {hasOtherActions && <DropdownMenuSeparator />}
          <DropdownMenuItem onSelect={() => void onHide()}>Hide widget</DropdownMenuItem>
        </>
      )}
    </RowActions>
  );
}
