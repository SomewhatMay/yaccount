import { expect, it } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { PageHeader } from "./PageHeader";
import { PageHeaderSkeleton } from "./ListSkeleton";

interface ElementProps {
  children?: ReactNode;
  className?: string;
}

function findElements(
  node: ReactNode,
  predicate: (element: ReactElement<ElementProps>) => boolean,
): ReactElement<ElementProps>[] {
  if (Array.isArray(node)) return node.flatMap((child) => findElements(child, predicate));
  if (!isValidElement<ElementProps>(node)) return [];
  return [
    ...(predicate(node) ? [node] : []),
    ...findElements(node.props.children, predicate),
  ];
}

function findElement(
  node: ReactNode,
  predicate: (element: ReactElement<ElementProps>) => boolean,
): ReactElement<ElementProps> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, predicate);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement<ElementProps>(node)) return null;
  if (predicate(node)) return node;
  return findElement(node.props.children, predicate);
}

it("keeps only the compact screen name and action visible on phones", () => {
  const tree = PageHeader({
    eyebrow: "Ledger structure",
    title: "Categories",
    action: <button type="button">New</button>,
    children: "Organize every entry.",
  });

  const heading = findElement(tree, (element) => element.type === "h1")!;
  const eyebrow = findElement(
    tree,
    (element) => typeof element.type === "function" && element.type.name === "Eyebrow",
  )!;
  const description = findElement(tree, (element) => element.type === "p")!;

  expect(heading.props.children).toBe("Categories");
  expect(heading.props.className).toContain("text-xl");
  expect(heading.props.className).toContain("sm:text-2xl");
  expect(eyebrow.props.className).toContain("hidden");
  expect(eyebrow.props.className).toContain("sm:block");
  expect(description.props.className).toContain("hidden");
  expect(description.props.className).toContain("sm:block");
});

it("matches the compact phone hierarchy while loading", () => {
  const skeletons = findElements(
    PageHeaderSkeleton({}),
    (element) => typeof element.type === "function" && element.type.name === "Skeleton",
  );

  expect(skeletons[0].props.className).toContain("hidden");
  expect(skeletons[0].props.className).toContain("sm:block");
  expect(skeletons[2].props.className).toContain("hidden");
  expect(skeletons[2].props.className).toContain("sm:block");
});
