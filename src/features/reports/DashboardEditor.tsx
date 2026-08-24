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
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { RowActions } from "@/features/ui";
import { cn } from "@/lib/utils";
import {
  PINNED_WIDGET_ID,
  reorderDashboardLayout,
  setWidgetSize,
  setWidgetVisible,
  type DashboardLayout,
  type DashboardWidgetEntry,
} from "./dashboard-layout";
import { DASHBOARD_WIDGETS, type WidgetContext } from "./registry";
import { DashboardWidget } from "./WidgetShell";

export function DashboardEditor({
  base,
  widgets,
  allWidgets,
  layout,
  onLayoutChange,
  onAddWidgets,
}: {
  base: WidgetContext;
  widgets: readonly DashboardWidgetEntry[];
  allWidgets: readonly DashboardWidgetEntry[];
  layout: DashboardLayout;
  onLayoutChange: (layout: DashboardLayout) => void;
  onAddWidgets: () => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  function finishDrag(event: DragEndEvent) {
    if (!event.over) return;
    const pinnedId = widgets.find(
      ({ instance }) => instance.widgetType === PINNED_WIDGET_ID,
    )?.instance.instanceId;
    onLayoutChange(
      reorderDashboardLayout(
        layout,
        String(event.active.id),
        String(event.over.id),
        pinnedId,
      ),
    );
  }

  function resetLayout() {
    const registryRank = new Map(
      DASHBOARD_WIDGETS.map((widget, index) => [widget.id, index]),
    );
    const ordered = [...allWidgets].sort(
      (a, b) =>
        (registryRank.get(a.def.id) ?? Number.MAX_SAFE_INTEGER) -
        (registryRank.get(b.def.id) ?? Number.MAX_SAFE_INTEGER),
    );
    onLayoutChange({
      order: ordered.map(({ instance }) => instance.instanceId),
      hidden: ordered.flatMap(({ instance, def }) =>
        !def.defaultVisible && instance.widgetType !== PINNED_WIDGET_ID
          ? [instance.instanceId]
          : [],
      ),
      sizes: Object.fromEntries(
        ordered.map(({ instance }) => [instance.instanceId, "expanded"]),
      ),
    });
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
        <Button type="button" variant="ghost" size="sm" onClick={resetLayout}>
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
          items={widgets.map(({ instance }) => instance.instanceId)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-4">
            {widgets.map((entry) => (
              <SortableDashboardWidget
                key={entry.instance.instanceId}
                entry={entry}
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
  entry,
  base,
  widgets,
  layout,
  onLayoutChange,
}: {
  entry: DashboardWidgetEntry;
  base: WidgetContext;
  widgets: readonly DashboardWidgetEntry[];
  layout: DashboardLayout;
  onLayoutChange: (layout: DashboardLayout) => void;
}) {
  const { def, instance } = entry;
  const pinned = instance.widgetType === PINNED_WIDGET_ID;
  const pinnedId = widgets.find(
    (candidate) => candidate.instance.widgetType === PINNED_WIDGET_ID,
  )?.instance.instanceId;
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id: instance.instanceId, disabled: pinned });

  return (
    <section
      ref={setNodeRef}
      data-widget-id={def.id}
      data-widget-instance-id={instance.instanceId}
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
            aria-label={`Move ${def.title}`}
            className="text-muted-foreground focus-visible:ring-ring/50 grid size-8 shrink-0 cursor-grab touch-none place-items-center rounded-lg focus-visible:ring-3 focus-visible:outline-none active:cursor-grabbing"
          >
            <GripVerticalIcon className="size-4" aria-hidden />
          </button>
        )}
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium">{def.title}</h2>
        {pinned ? (
          <span className="text-muted-foreground text-xs">Pinned</span>
        ) : (
          <>
            <MoveMenu
              entry={entry}
              widgets={widgets}
              layout={layout}
              onLayoutChange={onLayoutChange}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Hide ${def.title}`}
              onClick={() =>
                onLayoutChange(
                  setWidgetVisible(layout, instance.instanceId, false, pinnedId),
                )
              }
            >
              <EyeOffIcon aria-hidden />
            </Button>
          </>
        )}
      </div>
      <div inert className="pointer-events-none select-none">
        <DashboardWidget
          instanceId={instance.instanceId}
          size={layout.sizes[instance.instanceId] ?? instance.size}
          def={def}
          base={{
            ...base,
            instanceSubject: instance.subject,
            instanceSettings: instance.settings ?? {},
          }}
          editing
        />
      </div>
    </section>
  );
}

function MoveMenu({
  entry,
  widgets,
  layout,
  onLayoutChange,
}: {
  entry: DashboardWidgetEntry;
  widgets: readonly DashboardWidgetEntry[];
  layout: DashboardLayout;
  onLayoutChange: (layout: DashboardLayout) => void;
}) {
  const { def, instance } = entry;
  const index = widgets.findIndex(
    (candidate) => candidate.instance.instanceId === instance.instanceId,
  );
  const first = widgets.find(
    (candidate) => candidate.instance.widgetType !== PINNED_WIDGET_ID,
  );
  const previous = index > 1 ? widgets[index - 1] : null;
  const next = index >= 0 && index < widgets.length - 1 ? widgets[index + 1] : null;
  const last = widgets.at(-1);
  const pinnedId = widgets.find(
    (candidate) => candidate.instance.widgetType === PINNED_WIDGET_ID,
  )?.instance.instanceId;
  const moveOver = (target: DashboardWidgetEntry | undefined | null) => {
    if (target) {
      onLayoutChange(
        reorderDashboardLayout(
          layout,
          instance.instanceId,
          target.instance.instanceId,
          pinnedId,
        ),
      );
    }
  };

  return (
    <RowActions label={`Configure ${def.title}`} className="opacity-100">
      <DropdownMenuLabel>Size</DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={layout.sizes[instance.instanceId] ?? instance.size}
        onValueChange={(size) =>
          onLayoutChange(
            setWidgetSize(
              layout,
              instance.instanceId,
              size === "compact" ? "compact" : "expanded",
              pinnedId,
            ),
          )
        }
      >
        <DropdownMenuRadioItem
          value="compact"
          disabled={!def.renderCompact && !def.compactComponent}
        >
          Compact
        </DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="expanded">Expanded</DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
      <DropdownMenuSeparator />
      <DropdownMenuLabel>Move {def.title}</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem disabled={index <= 1} onSelect={() => moveOver(first)}>
        To top
      </DropdownMenuItem>
      <DropdownMenuItem disabled={!previous} onSelect={() => moveOver(previous)}>
        {previous ? `Before ${previous.def.title}` : "Before previous"}
      </DropdownMenuItem>
      <DropdownMenuItem disabled={!next} onSelect={() => moveOver(next)}>
        {next ? `After ${next.def.title}` : "After next"}
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={!last || last.instance.instanceId === instance.instanceId}
        onSelect={() => moveOver(last)}
      >
        To bottom
      </DropdownMenuItem>
    </RowActions>
  );
}
