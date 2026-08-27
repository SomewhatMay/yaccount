"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRightIcon, PlusIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ResponsiveSheet } from "@/features/ui";
import { cn } from "@/lib/utils";
import type { DashboardWidgetEntry, DashboardWidgetInstance } from "./dashboard-layout";
import { buildWidgetGallery, type WidgetGalleryItem } from "./widget-gallery";
import type { WidgetContext, WidgetDef, WidgetGalleryGroup } from "./registry";
import { watchSubjectOptions } from "./watch-subjects";

const SECTION_LABELS: Record<"suggested" | WidgetGalleryGroup | "needs-setup", string> = {
  suggested: "Suggested for you",
  planning: "Planning",
  forecasts: "Forecasts",
  watch: "Watch one thing",
  analysis: "Trends and analysis",
  "needs-setup": "Needs setup",
};

type InstanceConfiguration = {
  size?: DashboardWidgetInstance["size"];
  subject?: DashboardWidgetInstance["subject"];
  settings?: DashboardWidgetInstance["settings"];
};

export function WidgetGallerySheet({
  open,
  onOpenChange,
  definitions,
  entries,
  hiddenInstanceIds,
  context,
  onRestore,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  definitions: readonly WidgetDef[];
  entries: readonly DashboardWidgetEntry[];
  hiddenInstanceIds: readonly string[];
  context: WidgetContext;
  onRestore: (instanceId: string) => void;
  onCreate: (widgetType: string, configuration: InstanceConfiguration) => void;
}) {
  const [query, setQuery] = useState("");
  const gallery = useMemo(
    () => buildWidgetGallery(definitions, entries, hiddenInstanceIds, context, query),
    [context, definitions, entries, hiddenInstanceIds, query],
  );

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) setQuery("");
        onOpenChange(next);
      }}
      title="Add widgets"
      description="Find a question to add to this dashboard."
    >
      <div className="space-y-5 px-4 pb-5">
        <div className="relative">
          <SearchIcon
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search widgets"
            placeholder="Search widgets"
            className="h-10 rounded-full pl-9"
          />
        </div>

        {gallery.sections.length === 0 ? (
          <p className="text-muted-foreground py-12 text-center text-sm">
            {query
              ? "No widgets match that search."
              : "Every available widget is already on your dashboard."}
          </p>
        ) : (
          gallery.sections.map((section) => (
            <section key={section.id} aria-labelledby={`gallery-${section.id}`}>
              <h3
                id={`gallery-${section.id}`}
                className="text-muted-foreground mb-2 text-xs font-semibold tracking-[0.14em] uppercase"
              >
                {SECTION_LABELS[section.id]}
              </h3>
              <div className="space-y-2">
                {section.items.map((item) =>
                  item.subject && item.mode === "create" ? (
                    <SubjectWidgetCard
                      key={item.key}
                      item={item}
                      context={context}
                      onCreate={onCreate}
                    />
                  ) : (
                    <GalleryCard
                      key={item.key}
                      item={item}
                      onChoose={() =>
                        item.mode === "restore" && item.instanceId
                          ? onRestore(item.instanceId)
                          : onCreate(item.def.id, {})
                      }
                    />
                  ),
                )}
              </div>
            </section>
          ))
        )}
      </div>
    </ResponsiveSheet>
  );
}

function GalleryCard({
  item,
  onChoose,
}: {
  item: WidgetGalleryItem;
  onChoose: () => void;
}) {
  const copy = item.suggestion ?? item.def.description;
  if (item.availability.status !== "ready") {
    return (
      <div className="bg-card flex items-center gap-3 rounded-2xl border p-3">
        <WidgetMiniature id={item.def.id} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{item.def.title}</span>
          <span className="text-muted-foreground mt-0.5 block text-xs leading-relaxed">
            {item.availability.description}
          </span>
        </span>
        <Button asChild variant="ghost" size="icon-sm">
          <Link
            href={item.availability.action.href}
            aria-label={`${item.availability.action.label} for ${item.def.title}`}
          >
            <ArrowRightIcon aria-hidden />
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <button
      type="button"
      aria-label={`Add ${item.def.title}`}
      onClick={onChoose}
      className="bg-card hover:bg-muted/45 focus-visible:ring-ring/50 flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors focus-visible:ring-3 focus-visible:outline-none"
    >
      <WidgetMiniature id={item.def.id} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{item.def.title}</span>
        <span className="text-muted-foreground mt-0.5 block text-xs leading-relaxed">
          {copy}
        </span>
      </span>
      <span className="bg-primary text-primary-foreground grid size-7 shrink-0 place-items-center rounded-full">
        <PlusIcon className="size-3.5" aria-hidden />
      </span>
    </button>
  );
}

function SubjectWidgetCard({
  item,
  context,
  onCreate,
}: {
  item: WidgetGalleryItem;
  context: WidgetContext;
  onCreate: (widgetType: string, configuration: InstanceConfiguration) => void;
}) {
  const [selectedId, setSelectedId] = useState("");
  const subjectType = item.subject!;
  const options = watchSubjectOptions(
    subjectType,
    context.containers,
    context.categories,
  );

  return (
    <div className="bg-card rounded-2xl border p-3">
      <div className="flex items-center gap-3">
        <WidgetMiniature id={item.def.id} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{item.def.title}</span>
          <span className="text-muted-foreground mt-0.5 block text-xs leading-relaxed">
            {item.def.description}
          </span>
        </span>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Select value={selectedId} onValueChange={setSelectedId}>
          <SelectTrigger
            className="min-w-0 flex-1"
            aria-label={`Choose ${subjectType} for ${item.def.title}`}
          >
            <SelectValue placeholder={`Choose ${subjectType}`} />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          size="sm"
          disabled={!selectedId}
          aria-label={`Add ${item.def.title}`}
          onClick={() =>
            onCreate(item.def.id, {
              subject: { type: subjectType, id: selectedId },
            })
          }
        >
          Add
        </Button>
      </div>
      {options.length === 0 && (
        <p className="text-muted-foreground mt-2 text-xs">
          Create a {subjectType} before adding this watch.
        </p>
      )}
    </div>
  );
}

/** A small structural likeness helps identify a report before reading its name. */
function WidgetMiniature({ id }: { id: string }) {
  const ring = id === "breakdown";
  const calendar = id === "calendar";
  const list = ["recent", "payees", "upcoming", "largest", "goals", "flows"].includes(id);
  const figure = ["balance", "saved", "kpis", "pace"].includes(id);

  return (
    <span
      aria-hidden
      className="bg-surface-sunken grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl border"
    >
      {ring ? (
        <span className="border-brand/55 border-r-muted-foreground/25 size-8 rounded-full border-[6px]" />
      ) : calendar ? (
        <span className="grid grid-cols-4 gap-1">
          {Array.from({ length: 16 }, (_, index) => (
            <span
              key={index}
              className={cn(
                "size-1.5 rounded-[2px]",
                index % 5 === 0 ? "bg-brand/55" : "bg-muted-foreground/18",
              )}
            />
          ))}
        </span>
      ) : list ? (
        <span className="w-9 space-y-1.5">
          {[0, 1, 2].map((row) => (
            <span key={row} className="flex items-center gap-1">
              <span className="bg-brand/45 size-1.5 rounded-full" />
              <span className="bg-muted-foreground/22 h-1 flex-1 rounded-full" />
              <span className="bg-foreground/35 h-1 w-2 rounded-full" />
            </span>
          ))}
        </span>
      ) : figure ? (
        <span className="w-9">
          <span className="bg-foreground/45 block h-1.5 w-7 rounded-full" />
          <span className="border-brand/45 mt-2 block h-3 w-9 -skew-y-6 border-t" />
        </span>
      ) : (
        <span className="flex h-8 items-end gap-1">
          {[12, 24, 17, 29, 20].map((height, index) => (
            <span
              key={index}
              className={cn(
                "w-1.5 rounded-t-sm",
                index === 3 ? "bg-brand/55" : "bg-muted-foreground/24",
              )}
              style={{ height }}
            />
          ))}
        </span>
      )}
    </span>
  );
}
