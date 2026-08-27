import type { DashboardWidgetEntry } from "./dashboard-layout";
import type {
  WidgetAvailability,
  WidgetContext,
  WidgetDef,
  WidgetGalleryGroup,
} from "./registry";

export type GallerySectionId = "suggested" | WidgetGalleryGroup | "needs-setup";

export interface WidgetGalleryItem {
  key: string;
  def: WidgetDef;
  instanceId?: string;
  mode: "restore" | "create";
  subject?: "container" | "category";
  suggestion: string | null;
  availability: WidgetAvailability;
}

export interface WidgetGallerySection {
  id: GallerySectionId;
  items: WidgetGalleryItem[];
}

const SECTION_ORDER: GallerySectionId[] = [
  "suggested",
  "planning",
  "forecasts",
  "watch",
  "analysis",
  "needs-setup",
];

function matches(def: WidgetDef, query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return true;
  return [def.title, def.description, ...(def.gallery?.terms ?? [])]
    .join(" ")
    .toLocaleLowerCase()
    .includes(normalized);
}

export function buildWidgetGallery(
  definitions: readonly WidgetDef[],
  entries: readonly DashboardWidgetEntry[],
  hiddenInstanceIds: readonly string[],
  context: WidgetContext,
  query: string,
): { items: WidgetGalleryItem[]; sections: WidgetGallerySection[] } {
  const hidden = new Set(hiddenInstanceIds);
  const entriesByType = new Map<string, DashboardWidgetEntry[]>();
  for (const entry of entries) {
    const existing = entriesByType.get(entry.def.id) ?? [];
    existing.push(entry);
    entriesByType.set(entry.def.id, existing);
  }

  const items: WidgetGalleryItem[] = [];
  for (const def of definitions) {
    const metadata = def.gallery;
    if (!metadata || !matches(def, query)) continue;
    const configured = entriesByType.get(def.id) ?? [];

    for (const entry of configured) {
      if (!hidden.has(entry.instance.instanceId)) continue;
      const availability = def.availability?.(context) ?? { status: "ready" };
      items.push({
        key: `restore:${entry.instance.instanceId}`,
        def,
        instanceId: entry.instance.instanceId,
        mode: "restore",
        subject: metadata.subject,
        suggestion:
          availability.status === "ready" ? (metadata.suggest?.(context) ?? null) : null,
        availability,
      });
    }

    if (configured.length > 0 && !metadata.repeatable) continue;
    const availability = def.availability?.(context) ?? { status: "ready" };
    items.push({
      key: `create:${def.id}`,
      def,
      mode: "create",
      subject: metadata.subject,
      suggestion:
        availability.status === "ready" ? (metadata.suggest?.(context) ?? null) : null,
      availability,
    });
  }

  const sections = SECTION_ORDER.flatMap((id) => {
    const sectionItems = items.filter((item) => {
      if (item.availability.status !== "ready") return id === "needs-setup";
      if (item.suggestion) return id === "suggested";
      return item.def.gallery?.group === id;
    });
    return sectionItems.length > 0 ? [{ id, items: sectionItems }] : [];
  });
  return { items, sections };
}
