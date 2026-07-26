"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSetAtom } from "jotai";
import { flashRowAtom } from "@/features/store";
import { readFocus } from "@/features/focus-link";

/**
 * Land on the row a `?focus=` link names — mark it, bring it into view, then
 * strip the param.
 *
 * Lifted from `LedgerView`, which has done this since M11, because ⌘K results
 * now point at four more screens and "take me to this exact thing" has to mean
 * the same on all five. Stripping matters: a focus that stuck to the address bar
 * would re-flash a row you already found on every refresh.
 *
 * `reveal` is the screen's own follow-up — Goals and Recurring open the row's
 * sheet; Categories and Containers deliberately do not, since their only editor
 * is a rename field and opening one uninvited is how a search renames a
 * category. It is read through a ref so a caller need not memoise it to avoid
 * re-running the effect.
 */
export function useFocusParam(path: string, reveal?: (id: string) => void): void {
  const searchParams = useSearchParams();
  const router = useRouter();
  const flashRow = useSetAtom(flashRowAtom);
  const latest = useRef(reveal);

  useEffect(() => {
    latest.current = reveal;
  });

  useEffect(() => {
    const query = searchParams.toString();
    if (!query) return;
    const focus = readFocus(query);
    if (focus) {
      flashRow({ id: focus, scroll: true });
      latest.current?.(focus);
    }
    router.replace(path, { scroll: false });
  }, [searchParams, router, flashRow, path]);
}
