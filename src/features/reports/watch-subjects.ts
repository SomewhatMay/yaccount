import type { Category, Container } from "@/core/model";

export function watchSubjectOptions(
  type: "container" | "category",
  containers: readonly Container[],
  categories: readonly Category[],
): { id: string; name: string }[] {
  return type === "container"
    ? containers
        .filter((container) => !container.is_archived)
        .map((container) => ({ id: container.id, name: container.name }))
    : categories
        .filter(
          (category) =>
            category.type === "expense" &&
            !category.is_archived &&
            !category.excluded_from_stats,
        )
        .map((category) => ({ id: category.id, name: category.name }));
}
