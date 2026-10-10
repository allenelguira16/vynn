import type { JSX } from "../types/jsx";
import { $cmpnt, markParked, unmarkParked } from "../render/$cmpnt";
import { createAsyncElement, resolveNode } from "../render/resolve-node";
import { enterAsyncBoundary } from "./boundary";
import { getRenderMode } from "../utils/render-mode";

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
 * Displays a fallback while the children are initially loading.
 *
 * The fallback is shown only during the first pending state.
 * Once the children have been displayed successfully, subsequent async
 * operations keep the current children visible.
 *
 * @param props The fallback content and children to render.
 * @returns The rendered content.
 */
export const Await = $cmpnt(function Suspense(props: {
  fallback?: JSX.Element;
  children: JSX.Element;
}): JSX.Element {
  if (getRenderMode() === "sync") {
    return props.fallback;
  }
  if (getRenderMode() === "async") {
    const pending = new Set<Promise<any>>();

    enterAsyncBoundary((promise) => {
      pending.add(promise);
    });

    return resolveNode(() => props.children);
  }

  const start = document.createComment("suspense-start");
  const end = document.createComment("suspense-end");

  let fallback: Range;
  let children: Range;
  let active: Range | undefined;

  let pendingCount = 0;

  /**
   * Becomes true once the children have been displayed for the first time.
   *
   * After this point, new async operations do not show the fallback again.
   */
  let resolved = false;

  const show = (range: Range) => {
    const parent = start.parentNode;

    if (!parent || active === range) {
      return;
    }

    if (active) {
      moveRange(active, active.parkingLot);
    }

    moveRange(range, parent, end);
    active = range;
  };

  enterAsyncBoundary((promise) => {
    pendingCount++;

    /*
     * Only show the fallback during the initial load.
     *
     * Once the children have been shown, keep them visible even when
     * another async operation starts.
     */
    if (!resolved && start.parentNode && fallback) {
      show(fallback);
    }

    const complete = () => {
      pendingCount--;

      if (pendingCount === 0 && start.parentNode && children) {
        /*
         * The first time all initial async work completes, mark this
         * Suspense as resolved permanently.
         */
        if (!resolved) {
          resolved = true;
        }

        show(children);
      }
    };

    promise.then(complete, complete);
  });

  fallback = createRange(resolveNode(() => props.fallback));
  children = createRange(resolveNode(() => props.children));

  /*
   * If there was no async work during the initial render, the children
   * are immediately considered resolved.
   */
  if (pendingCount === 0) {
    resolved = true;
  }

  active = pendingCount > 0 && !resolved ? fallback : children;

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
function moveRange(
  range: Range,
  target: Node,
  before: Node | null = null,
): void {
  const fragment = document.createDocumentFragment();

  const parking = target === range.parkingLot;

  let node: Node | null = range.start;

  while (node) {
    const next: ChildNode | null = node.nextSibling;

    if (parking) {
      markParked(node);
    }

    fragment.append(node);

    if (node === range.end) {
      break;
    }

    node = next;
  }

  target.insertBefore(fragment, before);

  if (!parking) {
    let node: Node | null = range.start;

    while (node) {
      unmarkParked(node);

      const next: ChildNode | null = node.nextSibling;

      if (node === range.end) {
        break;
      }

      node = next;
    }
  }
}

// import { JSX } from "../types/jsx";
// import { $state } from "../reactivity/$state";
// import { $cmpnt } from "../render/$cmpnt";
// import { $dyn } from "../render/$dyn";
// import { enterAsyncBoundary } from "./boundary";

// /**
//  * Displays async content with an optional fallback.
//  *
//  * The fallback is displayed while the async content has not yet been
//  * resolved. Once the content is resolved, the children are displayed.
//  *
//  * Unlike `Suspense`, `Await` does not display the fallback simply because
//  * an async operation becomes pending after the content has been resolved.
//  *
//  * @param props The fallback content and children to render.
//  * @returns The rendered content.
//  */
// export const Await = $cmpnt(function Await(props: {
//   fallback?: JSX.Element;
//   children: JSX.Element;
// }) {
//   const view = $state<Node>();

//   const fallback = document.createDocumentFragment();
//   const children = document.createDocumentFragment();

//   let initialized = false;

//   enterAsyncBoundary((promise: Promise<void>) => {
//     if (initialized) return;

//     view.value = fallback;

//     promise.then(() => {
//       view.value = children;
//       initialized = true;
//     });
//   });

//   fallback.append(...$dyn(() => props.fallback));
//   children.append(...$dyn(() => props.children));

//   return $dyn(() => view.value || children);
// });
