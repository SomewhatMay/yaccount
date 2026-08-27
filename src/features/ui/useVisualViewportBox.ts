"use client";

import { useEffect, useState } from "react";

interface VisualViewportBox {
  top: number;
  height: number;
}

/**
 * The currently visible browser region. Safari/PWA metrics can settle after the
 * event itself, so reads happen in one coalesced animation frame.
 */
export function useVisualViewportBox(): VisualViewportBox | null {
  const [box, setBox] = useState<VisualViewportBox | null>(null);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = {
          top: Math.max(0, Math.round(viewport.offsetTop)),
          height: Math.max(0, Math.round(viewport.height)),
        };
        setBox((current) =>
          current?.top === next.top && current.height === next.height ? current : next,
        );
      });
    };

    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);

  return box;
}
