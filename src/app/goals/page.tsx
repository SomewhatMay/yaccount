import { Suspense } from "react";
import { GoalsView } from "@/features/goals/GoalsView";
import { ListSkeleton, PageHeaderSkeleton } from "@/features/ui";

/**
 * A `?focus=` link from ⌘K is read with `useSearchParams`, which a statically
 * exported build requires a Suspense boundary around.
 */
export default function GoalsPage() {
  return (
    <Suspense fallback={<Fallback />}>
      <GoalsView />
    </Suspense>
  );
}

function Fallback() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      <div className="bg-card overflow-hidden rounded-2xl border">
        <ListSkeleton />
      </div>
    </div>
  );
}
