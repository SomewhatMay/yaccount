"use client";

import { Eyebrow } from "@/features/ui/Eyebrow";

/** Compact screen identity on phones; fuller context returns on larger screens. */
export function PageHeader({
  eyebrow,
  title,
  action,
  children,
}: {
  /** The screen's name — matches the nav label. */
  eyebrow: string;
  /** What the screen is, said in the interface's voice (§12.6). */
  title: React.ReactNode;
  action?: React.ReactNode;
  /** One paragraph on what this screen is for. */
  children?: React.ReactNode;
}) {
  return (
    <section className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 pt-3 pb-1">
      <Eyebrow className="hidden shrink-0 sm:col-start-1 sm:row-start-1 sm:block">
        {eyebrow}
      </Eyebrow>
      <h1 className="font-display col-start-1 row-start-1 truncate text-xl font-semibold tracking-tight sm:row-start-2 sm:mt-1.5 sm:text-2xl">
        {title}
      </h1>
      {action && <div className="col-start-2 row-start-1">{action}</div>}
      {children && (
        <p className="text-muted-foreground col-span-2 mt-3 hidden max-w-md text-sm sm:block">
          {children}
        </p>
      )}
    </section>
  );
}
