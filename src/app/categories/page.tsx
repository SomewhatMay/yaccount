import { Suspense } from "react";
import { CategoriesView } from "@/features/categories/CategoriesView";
import { ListSkeleton, PageHeaderSkeleton } from "@/features/ui";

/**
 * A `?focus=` link from ⌘K is read with `useSearchParams`, which a statically
 * exported build requires a Suspense boundary around.
 */
export default function CategoriesPage() {
  return (
    <Suspense fallback={<Fallback />}>
      <CategoriesView />
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
