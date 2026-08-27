import { Suspense } from "react";
import { LedgerView } from "@/features/ledger/LedgerView";
import { FigureSkeleton, ListSkeleton } from "@/features/ui";

/**
 * The register reads its deep-link filter from the URL (`useSearchParams`), which
 * a statically-exported build requires a Suspense boundary around. The fallback
 * mirrors the view's own not-ready skeleton, so a cold load draws the page rather
 * than flashing blank.
 */
export default function LedgerPage() {
  return (
    <Suspense fallback={<LedgerFallback />}>
      <LedgerView />
    </Suspense>
  );
}

function LedgerFallback() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <FigureSkeleton />
      <div className="bg-card overflow-hidden rounded-2xl border">
        <ListSkeleton />
      </div>
    </div>
  );
}
