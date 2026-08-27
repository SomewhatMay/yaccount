import type { Op } from "@/core/oplog";

/** Diagnostic value without financial payload or entity names. */
export function operationLogFacts(operations: Op[]): {
  count: number;
  types: string[];
} {
  return {
    count: operations.length,
    types: [...new Set(operations.map((operation) => operation.type))].sort(),
  };
}
