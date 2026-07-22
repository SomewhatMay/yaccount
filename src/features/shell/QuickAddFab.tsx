"use client";

import { useSetAtom } from "jotai";
import { PlusIcon } from "lucide-react";
import { quickAddAtom } from "@/features/store";

/**
 * The one thing you do more than anything else, always under your thumb.
 *
 * Full-strength iris — this and the active tab are what §12.2 saves the spark
 * for. It floats clear of the tab bar and the home-indicator inset on a phone,
 * and drops into the corner on a desktop, where there is no bar under it.
 *
 * Pressing it starts §12.5's one orchestrated moment: the sheet rises
 * (`--dur-3`), you log, and the row lands in the register with a single iris
 * wash (`--dur-2`). The press itself is the whisper the rest of the app is
 * limited to — a colour and a hair of scale, on `--dur-1`.
 */
export function QuickAddFab() {
  const openQuickAdd = useSetAtom(quickAddAtom);
  return (
    <button
      type="button"
      onClick={() => openQuickAdd("expense")}
      aria-label="Log a transaction"
      className="bg-primary text-primary-foreground focus-visible:ring-ring/60 focus-visible:ring-offset-background fixed right-5 bottom-[calc(4.25rem_+_env(safe-area-inset-bottom))] z-40 inline-flex size-14 items-center justify-center rounded-full shadow-lg transition-transform duration-[var(--dur-1)] ease-[var(--ease-register)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none active:scale-95 lg:right-8 lg:bottom-8"
    >
      <PlusIcon className="size-6" aria-hidden />
    </button>
  );
}
