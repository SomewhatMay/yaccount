"use client";

import { Eyebrow } from "@/features/ui/Eyebrow";

/**
 * The top of a list screen: what you are looking at, and the one thing you can
 * add to it.
 *
 * The action sits on the EYEBROW's line, not the title's. Beside a `.figure-lg`
 * heading and a paragraph, a "New" button was competing with both for the same
 * 350px on a phone — the title wrapped, the lede squeezed into two thirds of the
 * column and the whole block read as cramped. Next to a short uppercase label it
 * has room to spare at every width, and the title and lede get the full column.
 *
 * `min-h-8` on that row is the button's own height, so screens without an action
 * (the Inbox) sit their title at exactly the same place as the ones with one.
 */
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
    <section className="pt-3 pb-1">
      {/* The eyebrow never shrinks: it is two words, and letting flexbox take
          width from it wraps "DASHBOARD" onto two lines to save a control eight
          pixels. The action absorbs the squeeze instead — the dashboard's period
          picker wraps its own chips when there isn't room. */}
      <div className="flex min-h-8 items-center justify-between gap-3">
        <Eyebrow className="shrink-0">{eyebrow}</Eyebrow>
        {action}
      </div>
      <h1 className="figure-lg mt-1.5">{title}</h1>
      {children && (
        <p className="text-muted-foreground mt-3 max-w-md text-sm">{children}</p>
      )}
    </section>
  );
}
