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
import {
  EyeOffIcon,
  GripVerticalIcon,
  LockKeyholeIcon,
  PlusIcon,
  RotateCcwIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { RowActions } from "@/features/ui";
import { cn } from "@/lib/utils";
import {
  PINNED_WIDGET_ID,
  defaultDashboardLayout,
  reorderDashboardLayout,
  setWidgetVisible,
  type DashboardLayout,
} from "./dashboard-layout";
import { DASHBOARD_WIDGETS, type WidgetContext, type WidgetDef } from "./registry";
import { DashboardWidget } from "./WidgetShell";

export function DashboardEditor({
  base,
  widgets,
  layout,
  onLayoutChange,
  onAddWidgets,
}: {
  base: WidgetContext;
  widgets: readonly WidgetDef[];
  layout: DashboardLayout;
  onLayoutChange: (layout: DashboardLayout) => void;
  onAddWidgets: () => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  function finishDrag(event: DragEndEvent) {
    if (!event.over) return;
    onLayoutChange(
      reorderDashboardLayout(layout, String(event.active.id), String(event.over.id)),
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-surface-sunken flex flex-wrap items-center gap-2 rounded-2xl px-4 py-3">
        <p className="text-muted-foreground min-w-52 flex-1 text-sm">
          Drag the reports themselves into reading order.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={onAddWidgets}>
          <PlusIcon aria-hidden />
          Add widgets
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onLayoutChange(defaultDashboardLayout(DASHBOARD_WIDGETS))}
        >
          <RotateCcwIcon aria-hidden />
          Reset
        </Button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={finishDrag}
      >
        <SortableContext
          items={widgets.map((widget) => widget.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-4">
            {widgets.map((widget) => (
              <SortableDashboardWidget
                key={widget.id}
                widget={widget}
                base={base}
                widgets={widgets}
                layout={layout}
                onLayoutChange={onLayoutChange}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SortableDashboardWidget({
  widget,
  base,
  widgets,
  layout,
  onLayoutChange,
}: {
  widget: WidgetDef;
  base: WidgetContext;
  widgets: readonly WidgetDef[];
  layout: DashboardLayout;
  onLayoutChange: (layout: DashboardLayout) => void;
}) {
  const pinned = widget.id === PINNED_WIDGET_ID;
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id: widget.id, disabled: pinned });

  return (
    <section
      ref={setNodeRef}
      data-widget-id={widget.id}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "bg-card relative overflow-clip rounded-2xl border",
        isDragging && "z-20 opacity-80 shadow-xl",
        isOver &&
          !isDragging &&
          "before:bg-rule before:absolute before:top-0 before:right-0 before:left-0 before:h-px before:content-['']",
      )}
    >
      <div className="bg-surface-sunken flex min-h-11 items-center gap-2 px-3">
        {pinned ? (
          <LockKeyholeIcon
            className="text-muted-foreground mx-2 size-4 shrink-0"
            aria-hidden
          />
        ) : (
          <button
            ref={setActivatorNodeRef}
            type="button"
            {...attributes}
            {...listeners}
            aria-label={`Move ${widget.title}`}
            className="text-muted-foreground focus-visible:ring-ring/50 grid size-8 shrink-0 cursor-grab touch-none place-items-center rounded-lg focus-visible:ring-3 focus-visible:outline-none active:cursor-grabbing"
          >
            <GripVerticalIcon className="size-4" aria-hidden />
          </button>
        )}
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium">{widget.title}</h2>
        {pinned ? (
          <span className="text-muted-foreground text-xs">Pinned</span>
        ) : (
          <>
            <MoveMenu
              widget={widget}
              widgets={widgets}
              layout={layout}
              onLayoutChange={onLayoutChange}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Hide ${widget.title}`}
              onClick={() => onLayoutChange(setWidgetVisible(layout, widget.id, false))}
            >
              <EyeOffIcon aria-hidden />
            </Button>
          </>
        )}
      </div>
      <div inert className="pointer-events-none select-none">
        <DashboardWidget def={widget} base={base} editing />
      </div>
    </section>
  );
}

function MoveMenu({
  widget,
  widgets,
  layout,
  onLayoutChange,
}: {
  widget: WidgetDef;
  widgets: readonly WidgetDef[];
  layout: DashboardLayout;
  onLayoutChange: (layout: DashboardLayout) => void;
}) {
  const index = widgets.findIndex((candidate) => candidate.id === widget.id);
  const first = widgets.find((candidate) => candidate.id !== PINNED_WIDGET_ID);
  const previous = index > 1 ? widgets[index - 1] : null;
  const next = index >= 0 && index < widgets.length - 1 ? widgets[index + 1] : null;
  const last = widgets.at(-1);
  const moveOver = (target: WidgetDef | undefined | null) => {
    if (target) {
      onLayoutChange(reorderDashboardLayout(layout, widget.id, target.id));
    }
  };

  return (
    <RowActions label={`Move ${widget.title} without dragging`} className="opacity-100">
      <DropdownMenuLabel>Move {widget.title}</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem disabled={index <= 1} onSelect={() => moveOver(first)}>
        To top
      </DropdownMenuItem>
      <DropdownMenuItem disabled={!previous} onSelect={() => moveOver(previous)}>
        {previous ? `Before ${previous.title}` : "Before previous"}
      </DropdownMenuItem>
      <DropdownMenuItem disabled={!next} onSelect={() => moveOver(next)}>
        {next ? `After ${next.title}` : "After next"}
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={!last || last.id === widget.id}
        onSelect={() => moveOver(last)}
      >
        To bottom
      </DropdownMenuItem>
    </RowActions>
  );
}
