import { constrains, matchesWords, terms } from "@/core/engine/filter";
import { GENERAL_CONTAINER_ID, type Container } from "@/core/model";

/**
 * The containers list, narrowed and ordered. Its own predicate — a container is
 * a place money lives, not a movement of it — over the shared meaning of the
 * controls.
 */

export type ContainerKind = "plain" | "investment";
/** Whether it feeds the headline figure (§5.7's opt-in rule). */
export type CountedState = "counted" | "uncounted";
export type ContainerState = "active" | "archived";

export interface ContainerFilter {
  text?: string;
  kinds?: ContainerKind[];
  counted?: CountedState[];
  states?: ContainerState[];
}

export function matchesContainer(container: Container, filter: ContainerFilter): boolean {
  if (!matchesWords(container.name, terms(filter.text))) return false;
  if (
    constrains(filter.kinds) &&
    !filter.kinds.includes(container.is_investment ? "investment" : "plain")
  )
    return false;
  if (
    constrains(filter.counted) &&
    !filter.counted.includes(
      container.include_in_overall_balance ? "counted" : "uncounted",
    )
  )
    return false;
  if (
    constrains(filter.states) &&
    !filter.states.includes(container.is_archived ? "archived" : "active")
  )
    return false;
  return true;
}

export function applyContainerFilter(
  containers: Container[],
  filter: ContainerFilter,
): Container[] {
  return containers.filter((c) => matchesContainer(c, filter));
}

export function activeContainerFilterCount(filter: ContainerFilter): number {
  let n = 0;
  if (terms(filter.text).length > 0) n += 1;
  if (constrains(filter.kinds)) n += 1;
  if (constrains(filter.counted)) n += 1;
  if (constrains(filter.states)) n += 1;
  return n;
}

export const CONTAINER_SORTS = ["name", "balance"] as const;
export type ContainerSort = (typeof CONTAINER_SORTS)[number];

/** Whether a stored preference is one this build still knows how to render. */
export function isContainerSort(value: string): value is ContainerSort {
  return (CONTAINER_SORTS as readonly string[]).includes(value);
}

export interface ContainerSortContext {
  balance: (container: Container) => number;
}

/**
 * Containers in the order the reader asked for. Returns a new array.
 *
 * By name, the default wallet is pinned first: it is where every entry lands
 * unless told otherwise, and burying it alphabetically would make the list read
 * as though it weren't special. By balance the pin is dropped — the question is
 * "where is the money", and the answer is whatever it is. Balance sorts SIGNED,
 * so an overdrawn container sits at the bottom where it belongs.
 */
export function sortContainers(
  containers: Container[],
  order: ContainerSort,
  ctx: ContainerSortContext,
): Container[] {
  const byName = (a: Container, b: Container) =>
    a.name.localeCompare(b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

  return [...containers].sort((a, b) => {
    if (order === "balance") {
      const delta = ctx.balance(b) - ctx.balance(a);
      return delta !== 0 ? delta : byName(a, b);
    }
    if (a.id === GENERAL_CONTAINER_ID) return -1;
    if (b.id === GENERAL_CONTAINER_ID) return 1;
    return byName(a, b);
  });
}
