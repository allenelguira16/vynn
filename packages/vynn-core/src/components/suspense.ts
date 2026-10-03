import { JSX } from "../types/jsx";
import { $cmpnt } from "../render/$cmpnt";
import { resolveNode } from "../render/resolve-node";

type Boundary = (promise: Promise<void>) => void;

const suspenseBoundaries: Boundary[] = [];

/**
 * Returns the nearest active Suspense boundary.
 *
 * @returns The active boundary, or `undefined` when called outside of Suspense.
 */
export function getSuspenseBoundary(): Boundary | undefined {
  return suspenseBoundaries.at(-1);
}

/**
 * Represents a movable range of DOM nodes used by Suspense.
 *
 * The range is kept in a parking lot while it is inactive and moved into
 * the DOM when it becomes active.
 */
type Range = {
  start: Comment;
  end: Comment;
  parkingLot: DocumentFragment;
};

/**
 * Provides a boundary for suspending content while an async operation is pending.
 *
 * The fallback and children are rendered into separate DOM ranges. Suspense
 * switches between those ranges as registered promises resolve.
 *
 * @param props The fallback content and children rendered by the boundary.
 * @returns The boundary markers used to manage the rendered content.
 */
export const Suspense = $cmpnt(function Suspense(props: {
  fallback?: JSX.Element;
  children: JSX.Element;
}): JSX.Element {
  const start = document.createTextNode("");
  const end = document.createTextNode("");

  let fallback: Range | undefined;
  let children: Range | undefined;
  let active: Range | undefined;

  const show = (range: Range) => {
    const parent = start.parentNode;

    if (!parent || active === range) return;

    if (active) {
      moveRange(active, active.parkingLot);
    }

    moveRange(range, parent, end);
    active = range;
  };

  suspenseBoundaries.push((promise) => {
    queueMicrotask(() => {
      if (fallback) show(fallback);

      promise.then(() => {
        if (children) show(children);
      });
    });
  });

  try {
    fallback = createRange(resolveNode(() => props.fallback));
    children = createRange(resolveNode(() => props.children));

    queueMicrotask(() => {
      if (!active && children) {
        show(children);
      }
    });

    return [start, end];
  } finally {
    suspenseBoundaries.pop();
  }
});

/**
 * Creates a parked DOM range from a list of nodes.
 */
function createRange(nodes: Node[]): Range {
  const start = document.createTextNode("");
  const end = document.createTextNode("");
  const parkingLot = document.createDocumentFragment();

  parkingLot.append(start, ...nodes, end);

  return { start, end, parkingLot };
}

/**
 * Moves a DOM range from its current parent into the target node.
 *
 * @param range The range of nodes to move.
 * @param target The node that will contain the range.
 * @param before The node to insert the range before, or `null` to append it.
 */
function moveRange(range: Range, target: Node, before: Node | null = null) {
  const fragment = document.createDocumentFragment();

  let node: Node | null = range.start;

  while (node) {
    const next = node.nextSibling as Node;

    fragment.append(node);

    if (node === range.end) break;

    node = next;
  }

  target.insertBefore(fragment, before);
}
