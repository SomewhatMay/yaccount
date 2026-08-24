import type { Container } from "@/core/model";

export interface InvestmentValueAction {
  id: string;
  title: "Record investment value";
  subtitle: string;
  containerId: string;
}

/** One direct command per current investment; plain and archived containers
 * cannot accept a new reported value. */
export function buildInvestmentValueActions(
  containers: Container[],
): InvestmentValueAction[] {
  return containers
    .filter((container) => container.is_investment && !container.is_archived)
    .map((container) => ({
      id: `act:investment:${container.id}`,
      title: "Record investment value",
      subtitle: container.name,
      containerId: container.id,
    }));
}
