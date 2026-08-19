"use client";

import { CSS } from "@dnd-kit/utilities";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { GripVerticalIcon, LockKeyholeIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SheetFooter } from "@/components/ui/sheet";
import { ResponsiveSheet } from "@/features/ui";
import { cn } from "@/lib/utils";
import {
  PINNED_WIDGET_ID,
  defaultDashboardLayout,
  reorderDashboardLayout,
  setWidgetVisible,
  type DashboardLayout,
} from "./dashboard-layout";
import type { WidgetDef } from "./registry";

export function WidgetLayoutSheet({
  open,
  onOpenChange,
  widgets,
  layout,
  onLayoutChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  widgets: readonly WidgetDef[];
  layout: DashboardLayout;
  onLayoutChange: (layout: DashboardLayout) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );
  const byId = new Map(widgets.map((widget) => [widget.id, widget]));
  const ordered = layout.order.flatMap((id) => {
    const widget = byId.get(id);
    return widget ? [widget] : [];
  });
  const movableIds = layout.order.filter((id) => id !== PINNED_WIDGET_ID);

  function finishDrag(event: DragEndEvent) {
    if (!event.over) return;
    onLayoutChange(
      reorderDashboardLayout(layout, String(event.active.id), String(event.over.id)),
    );
  }

  function keyboardMove(id: string, direction: -1 | 1) {
    const from = layout.order.indexOf(id);
    const to = Math.min(layout.order.length - 1, Math.max(1, from + direction));
    if (from < 1 || from === to) return;
    onLayoutChange(reorderDashboardLayout(layout, id, layout.order[to]));
  }

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Customize dashboard"
      description="Drag reports into your preferred order. Hide anything you do not need."
      bodyClassName="overflow-hidden"
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
          <div className="divide-border overflow-hidden rounded-xl border">
            {ordered[0]?.id === PINNED_WIDGET_ID && (
              <FixedWidgetRow
                widget={ordered[0]}
                visible={!layout.hidden.includes(ordered[0].id)}
              />
            )}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={finishDrag}
            >
              <SortableContext items={movableIds} strategy={verticalListSortingStrategy}>
                {ordered
                  .filter((widget) => widget.id !== PINNED_WIDGET_ID)
                  .map((widget) => (
                    <SortableWidgetRow
                      key={widget.id}
                      widget={widget}
                      visible={!layout.hidden.includes(widget.id)}
                      onVisibleChange={(visible) =>
                        onLayoutChange(setWidgetVisible(layout, widget.id, visible))
                      }
                      onKeyboardMove={(direction) => keyboardMove(widget.id, direction)}
                    />
                  ))}
              </SortableContext>
            </DndContext>
          </div>
        </div>
        <SheetFooter className="bg-popover relative z-20 shrink-0 flex-row items-center border-t">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onLayoutChange(defaultDashboardLayout(widgets))}
          >
            Reset
          </Button>
          <Button type="button" className="ml-auto" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </SheetFooter>
      </div>
    </ResponsiveSheet>
  );
}

function FixedWidgetRow({ widget, visible }: { widget: WidgetDef; visible: boolean }) {
  return (
    <div
      data-widget-id={widget.id}
      className="bg-muted/35 flex min-h-12 items-center gap-3 border-b px-3"
    >
      <LockKeyholeIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{widget.title}</span>
      <Checkbox checked={visible} disabled aria-label={`Show ${widget.title}`} />
    </div>
  );
}

function SortableWidgetRow({
  widget,
  visible,
  onVisibleChange,
  onKeyboardMove,
}: {
  widget: WidgetDef;
  visible: boolean;
  onVisibleChange: (visible: boolean) => void;
  onKeyboardMove: (direction: -1 | 1) => void;
}) {
  const [keyboardDragging, setKeyboardDragging] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widget.id });

  return (
    <div
      ref={setNodeRef}
      data-widget-id={widget.id}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "bg-popover flex min-h-12 items-center gap-3 border-b px-3 last:border-b-0",
        !visible && "text-muted-foreground",
        isDragging && "relative z-10 shadow-md",
      )}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Move ${widget.title}`}
        aria-describedby={`widget-move-help-${widget.id}`}
        aria-pressed={keyboardDragging}
        className="text-muted-foreground focus-visible:ring-ring/50 -ml-1 grid size-8 shrink-0 touch-none place-items-center rounded-lg focus-visible:ring-3 focus-visible:outline-none"
        onKeyDown={(event) => {
          if (event.code === "Space") {
            event.preventDefault();
            setKeyboardDragging((active) => !active);
          } else if (keyboardDragging && event.code === "ArrowUp") {
            event.preventDefault();
            onKeyboardMove(-1);
          } else if (keyboardDragging && event.code === "ArrowDown") {
            event.preventDefault();
            onKeyboardMove(1);
          } else if (keyboardDragging && event.code === "Escape") {
            event.preventDefault();
            setKeyboardDragging(false);
          }
        }}
      >
        <GripVerticalIcon className="size-4" aria-hidden />
      </button>
      <span id={`widget-move-help-${widget.id}`} className="sr-only">
        Press Space, then use Up and Down arrows. Press Space again to finish.
      </span>
      <label
        htmlFor={`widget-visible-${widget.id}`}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-3"
      >
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {widget.title}
        </span>
        <Checkbox
          id={`widget-visible-${widget.id}`}
          checked={visible}
          onCheckedChange={(checked) => onVisibleChange(checked === true)}
          aria-label={`Show ${widget.title}`}
        />
      </label>
    </div>
  );
}
