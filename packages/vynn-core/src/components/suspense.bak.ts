import type { JSX } from "../types/jsx";
import { $cmpnt } from "../render/$cmpnt";
import { resolveNode } from "../render/resolve-node";
import { enterAsyncBoundary } from "./boundary";

/**
 * Represents a movable DOM range.
 *
 * The range lives inside its parking lot while inactive and is moved into
 * the document when it becomes active.
 */
type Range = {
  start: Comment;
  end: Comment;
  nodes: Node[];
  parkingLot: DocumentFragment;
};

/**
 * Displays a fallback while async operations in its children are pending.
 *
 * The fallback is shown whenever one or more async operations are pending.
 * Once all pending operations resolve, the children are displayed.
 *
 * @param props The fallback content and children to render.
 * @returns The rendered content.
 */
export const Suspense = $cmpnt(function Suspense(props: {
  fallback?: JSX.Element;
  children: JSX.Element;
}): JSX.Element {
  const start = document.createComment("suspense-start");
  const end = document.createComment("suspense-end");

  let fallback: Range;
  let children: Range;
  let active: Range | undefined;

  let pendingCount = 0;

  const show = (range: Range) => {
    const parent = start.parentNode;

    if (!parent || active === range) return;

    if (active) {
      moveRange(active, active.parkingLot);
    }

    moveRange(range, parent, end);
    active = range;
  };

  enterAsyncBoundary((promise) => {
    pendingCount++;

    if (start.parentNode && fallback) {
      show(fallback);
    }

    const complete = () => {
      pendingCount--;

      if (pendingCount === 0 && start.parentNode && children) {
        show(children);
      }
    };

    promise.then(complete, complete);
  });

  fallback = createRange(resolveNode(() => props.fallback));
  children = createRange(resolveNode(() => props.children));

  active = pendingCount > 0 ? fallback : children;

  return [start, active.start, ...active.nodes, active.end, end];
});

/**
 * Creates a parked DOM range from a list of nodes.
 */
function createRange(nodes: Node[]): Range {
  const start = document.createComment("range-start");
  const end = document.createComment("range-end");
  const parkingLot = document.createDocumentFragment();

  parkingLot.append(start, ...nodes, end);

  return {
    start,
    end,
    nodes,
    parkingLot,
  };
}

/**
 * Moves an entire range from its current parent into the target.
 *
 * The range's start and end markers move together with its contents.
 *
 * @param range The range to move.
 * @param target The node that will contain the range.
 * @param before The node to insert the range before.
 */
function moveRange(range: Range, target: Node, before: Node | null = null) {
  const fragment = document.createDocumentFragment();

  let node: Node | null = range.start;

  while (node) {
    const next: ChildNode | null = node.nextSibling;

    fragment.append(node);

    if (node === range.end) break;

    node = next;
  }

  target.insertBefore(fragment, before);
}
