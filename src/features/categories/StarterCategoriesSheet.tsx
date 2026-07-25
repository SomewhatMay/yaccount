"use client";

import { useRef, useState } from "react";
import type { Category, CategoryType } from "@/core/model";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SheetFooter } from "@/components/ui/sheet";
import { CategoryGlyph } from "@/features/category-icons";
import { categoryDotColor } from "@/features/category-color";
import { ResponsiveSheet } from "@/features/ui";
import { InlineError } from "@/features/ui/InlineError";
import {
  DEFAULT_STARTER_KEYS,
  STARTER_CATEGORIES,
  buildStarterCategoryOps,
} from "./starter-categories";
import type { Op } from "@/core/oplog";

export function StarterCategoriesSheet({
  open,
  siblings,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  siblings: Category[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (ops: Op[]) => Promise<void>;
}) {
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Everyday starter"
      description="Choose what fits. Rename or archive these anytime. No budgets or amounts are created."
    >
      {open && (
        <StarterForm
          siblings={siblings}
          onSubmit={onSubmit}
          onCancel={() => onOpenChange(false)}
        />
      )}
    </ResponsiveSheet>
  );
}

function StarterForm({
  siblings,
  onSubmit,
  onCancel,
}: {
  siblings: Category[];
  onSubmit: (ops: Op[]) => Promise<void>;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState(() => new Set(DEFAULT_STARTER_KEYS));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const retryOps = useRef<Op[] | null>(null);

  function toggle(key: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  async function submit() {
    if (selected.size === 0 || saving) return;
    setError("");
    setSaving(true);
    try {
      retryOps.current ??= buildStarterCategoryOps(selected, siblings);
      await onSubmit(retryOps.current);
    } catch {
      setError("Couldn't add the starter categories. Nothing was added. Try again.");
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 px-4 pb-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setSelected(new Set(DEFAULT_STARTER_KEYS))}
        >
          Select all
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setSelected(new Set())}
        >
          Clear
        </Button>
        <span className="text-muted-foreground ml-auto text-xs">
          {selected.size} selected
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4">
        {(["expense", "income"] as CategoryType[]).map((type) => (
          <fieldset key={type} className="mb-5">
            <legend className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
              {type === "expense" ? "Expense" : "Income"}
            </legend>
            <div className="divide-y rounded-xl border">
              {STARTER_CATEGORIES.filter((item) => item.type === type).map((item) => {
                const id = `starter-${item.key}`;
                return (
                  <label
                    key={item.key}
                    htmlFor={id}
                    className="flex cursor-pointer items-center gap-3 px-3 py-2.5"
                  >
                    <Checkbox
                      id={id}
                      checked={selected.has(item.key)}
                      onCheckedChange={(checked) => toggle(item.key, checked === true)}
                      aria-label={`Add ${item.name}`}
                    />
                    <CategoryGlyph
                      icon={item.icon}
                      color={categoryDotColor(`starter:${item.key}`)}
                    />
                    <span className="text-sm font-medium">{item.name}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
        {error && <InlineError id="starter-error">{error}</InlineError>}
      </div>

      <SheetFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button
          type="button"
          onClick={submit}
          disabled={selected.size === 0 || saving}
          aria-describedby={error ? "starter-error" : undefined}
        >
          {saving ? "Adding…" : `Add ${selected.size} categories`}
        </Button>
      </SheetFooter>
    </div>
  );
}
