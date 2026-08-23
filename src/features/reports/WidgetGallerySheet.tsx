"use client";

import { PlusIcon } from "lucide-react";
import { ResponsiveSheet } from "@/features/ui";
import { cn } from "@/lib/utils";
import type { WidgetDef } from "./registry";

export function WidgetGallerySheet({
  open,
  onOpenChange,
  widgets,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  widgets: readonly WidgetDef[];
  onAdd: (id: string) => void;
}) {
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Add widgets"
      description="Choose reports to return to your dashboard."
    >
      <div className="space-y-3 px-4 pb-5">
        {widgets.length === 0 ? (
          <p className="text-muted-foreground py-12 text-center text-sm">
            Every widget is already on your dashboard.
          </p>
        ) : (
          widgets.map((widget) => (
            <button
              key={widget.id}
              type="button"
              aria-label={`Add ${widget.title}`}
              onClick={() => onAdd(widget.id)}
              className="bg-card hover:bg-muted/45 focus-visible:ring-ring/50 flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors focus-visible:ring-3 focus-visible:outline-none"
            >
              <WidgetMiniature id={widget.id} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{widget.title}</span>
                <span className="text-muted-foreground mt-0.5 block text-xs leading-relaxed">
                  {widget.description}
                </span>
              </span>
              <span className="bg-primary text-primary-foreground grid size-7 shrink-0 place-items-center rounded-full">
                <PlusIcon className="size-3.5" aria-hidden />
              </span>
            </button>
          ))
        )}
      </div>
    </ResponsiveSheet>
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
