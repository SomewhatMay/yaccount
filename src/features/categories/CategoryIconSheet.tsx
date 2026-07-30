"use client";

import { useMemo, useState } from "react";
import { CheckIcon } from "lucide-react";
import type { Category } from "@/core/model";
import { cn } from "@/lib/utils";
import { categoryColor } from "@/features/category-color";
import { CategoryGlyph, searchCategoryIcons } from "@/features/category-icons";
import { ResponsiveSheet } from "@/features/ui";
import { Input } from "@/components/ui/input";

/**
 * Choosing a category's icon (§10.1, M11). A category wears a colour dot by
 * default; here it can take a Lucide mark instead, searchable by what it is
 * ("rent", "gym", "petrol"). Clearing goes back to the dot.
 *
 * It is a sheet, not a popover, for two reasons: an extensive searchable grid
 * wants the room, and a modal surface owns its own focus — which the earlier
 * popover, opened from a closing menu, did not (it flickered shut).
 */
export function CategoryIconSheet({
  category,
  onOpenChange,
  onPick,
}: {
  category: Category | null;
  onOpenChange: (open: boolean) => void;
  /** `null` clears the icon back to the colour dot. */
  onPick: (icon: string | null) => void;
}) {
  return (
    <ResponsiveSheet
      open={category !== null}
      onOpenChange={onOpenChange}
      title="Set icon"
      description={
        category
          ? `Pick a mark for ${category.name}, or clear it to use the colour dot.`
          : ""
      }
    >
      {category && <IconPicker key={category.id} category={category} onPick={onPick} />}
    </ResponsiveSheet>
  );
}

function IconPicker({
  category,
  onPick,
}: {
  category: Category;
  onPick: (icon: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchCategoryIcons(query), [query]);
  const color = categoryColor(category);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-4">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search icons — rent, food, gym…"
          aria-label="Search icons"
        />
      </div>

      <div className="mt-3 px-4 pb-4">
        {/* The always-available way back to the plain dot. */}
        <button
          type="button"
          onClick={() => onPick(null)}
          aria-pressed={category.icon === null}
          className="hover:bg-muted/60 focus-visible:ring-ring flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          <CategoryGlyph icon={null} color={color} />
          <span className="flex-1 text-left">Colour dot</span>
          {category.icon === null && (
            <CheckIcon className="text-muted-foreground size-4" />
          )}
        </button>

        {results.length === 0 ? (
          <p className="text-muted-foreground px-1 py-8 text-center text-sm">
            No icons match “{query}”.
          </p>
        ) : (
          <div className="mt-2 grid grid-cols-6 gap-1.5 sm:grid-cols-7">
            {results.map((e) => {
              const active = category.icon === e.name;
              return (
                <button
                  key={e.name}
                  type="button"
                  onClick={() => onPick(e.name)}
                  aria-label={e.name}
                  aria-pressed={active}
                  className={cn(
                    "hover:bg-muted/60 focus-visible:ring-ring flex aspect-square items-center justify-center rounded-lg transition-colors focus-visible:ring-2 focus-visible:outline-none",
                    active && "bg-muted ring-foreground ring-2",
                  )}
                >
                  <e.Icon className="size-5" style={{ color }} />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
