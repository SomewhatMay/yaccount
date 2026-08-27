import { Suspense } from "react";
import { ContainersView } from "@/features/containers/ContainersView";
import { ListSkeleton, PageHeaderSkeleton } from "@/features/ui";

/**
 * A `?focus=` link from ⌘K is read with `useSearchParams`, which a statically
 * exported build requires a Suspense boundary around.
 */
export default function ContainersPage() {
  return (
    <Suspense fallback={<Fallback />}>
      <ContainersView />
    </Suspense>
  );
}

function Fallback() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeaderSkeleton />
      <div className="bg-card overflow-hidden rounded-2xl border">
        <ListSkeleton />
      </div>
    </div>
  );
}
