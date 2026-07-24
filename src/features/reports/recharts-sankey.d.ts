/**
 * Minimal ambient typings for the one private recharts module the Sankey layout
 * test reaches into. Same approach as `src/auth/gis.d.ts`: declare exactly the
 * surface we depend on rather than pull in a dependency or widen everything to
 * `any`.
 *
 * `computeData` is recharts' Sankey layout pass. It is real and stable enough to
 * test against, but it is not in the package's public export, so TypeScript has
 * nothing to go on. Only `sankey-layout.test.ts` uses it; no app code does.
 */
declare module "recharts/es6/chart/Sankey" {
  interface SankeyLayoutNode {
    x: number;
    y: number;
    dx: number;
    dy: number;
    depth: number;
    name: string;
    value: number;
  }

  interface SankeyLayoutLink {
    source: number;
    target: number;
    value: number;
    dy: number;
    sy: number;
    ty: number;
  }

  export function computeData(args: {
    data: {
      nodes: unknown[];
      links: { source: number; target: number; value: number }[];
    };
    width: number;
    height: number;
    iterations: number;
    nodeWidth: number;
    nodePadding: number;
    sort: boolean;
    verticalAlign: "justify" | "top";
    align: "left" | "justify";
  }): { nodes: SankeyLayoutNode[]; links: SankeyLayoutLink[] };
}
