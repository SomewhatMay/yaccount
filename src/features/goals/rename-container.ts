import type { Container, Goal } from "@/core/model";
import { nameTaken } from "@/features/unique-name";

export function renamedGoalContainer(
  goal: Goal,
  name: string,
  containers: Container[],
): Container | null {
  const container = containers.find((candidate) => candidate.id === goal.container_id);
  if (!container) throw new Error("This goal's container no longer exists.");
  if (nameTaken(containers, name, container.id)) {
    throw new Error("You already have a container with that name.");
  }
  return container.name === name ? null : { ...container, name };
}
