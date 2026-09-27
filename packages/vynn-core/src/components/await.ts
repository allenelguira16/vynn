import type { JSX } from "../types/jsx";
import { $cmpnt, markParked, unmarkParked } from "../render/$cmpnt";
import { createSSRAsync, resolveNode, SSR_NODE } from "../render/resolve-node";
import { enterAsyncBoundary } from "./boundary";
import { getRenderMode } from "../utils/render-mode";
import { getCurrentOwner, runWithOwner } from "../life-cycle/owner";

type RenderRange = {
  start: Comment;
  end: Comment;
  nodes: Node[];
  parkingLot: DocumentFragment;
};

type PendingPromise = Promise<unknown>;

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
  const mode = getRenderMode();

  if (mode === "sync") {
    return props.fallback;
  }

  if (mode === "async") {
    const children = memoize(() => props.children);
    const owner = getCurrentOwner();

    const pending: Promise<any>[] = [];

    enterAsyncBoundary((promise) => {
      pending.push(promise);
    });

    try {
      return children();
    } finally {
      if (pending.length) {
        return createSSRAsync(async () => {
          return runWithOwner(owner, async () => {
            await Promise.all(pending);
            // console.log(pending);

            const result = await Promise.all([children()].flat());
            return resolveNode(() => result);
          }) as unknown as SSR_NODE[];
        }) as unknown as JSX.Element[];
      }

      return children();
    }
  }

  if (mode) {
    return props.children;
  }

  const start = document.createTextNode("");
  const end = document.createTextNode("");

  const getFallback = memoize(() => props.fallback);
  const getChildren = memoize(() => props.children);

  const fallbackRange = createRange(resolveNode(getFallback));
  const childrenRange = createRange([]);

  const pending = new Set<PendingPromise>();

  let active: RenderRange | undefined;
  let childrenReady = false;

  function show(range: RenderRange): void {
    const parent = start.parentNode;

    if (!parent || active === range) {
      return;
    }

    if (active) {
      moveRange(active, active.parkingLot);
    }

    moveRange(range, parent, end);

    active = range;
  }

  let resolved = false;

  function registerPromise(promise: PendingPromise): void {
    if (pending.has(promise)) {
      return;
    }

    pending.add(promise);

    if (!resolved && start.parentNode && active !== fallbackRange) {
      show(fallbackRange);
    }

    promise.then(
      () => settlePromise(promise),
      () => settlePromise(promise),
    );
  }

  function renderChildren(): void {
    try {
      const nodes = resolveNode(getChildren);

      populateRange(childrenRange, nodes);
      childrenReady = true;
      resolved = true;
    } catch (error) {
      if (error instanceof Promise) {
        registerPromise(error);
        return;
      }

      throw error;
    }
  }

  /**
   * Marks a promise as settled and displays children only when all
   * tracked operations have settled.
   */
  function settlePromise(promise: PendingPromise): void {
    if (!pending.delete(promise)) {
      return;
    }

    if (pending.size > 0) {
      return;
    }

    if (!childrenReady) {
      renderChildren();
    }

    if (pending.size === 0 && childrenReady && start.parentNode) {
      show(childrenRange);
    }
  }

  enterAsyncBoundary(registerPromise);

  renderChildren();

  active = pending.size > 0 ? fallbackRange : childrenRange;

  return [start, active.start, ...active.nodes, active.end, end];
});

/**
 * Caches a getter's first successful result.
 *
 * If the getter throws, it is not cached and may be retried.
 */
function memoize<T>(getter: () => T): () => T {
  let initialized = false;
  let value: T;

  return () => {
    if (initialized) {
      return value;
    }

    const result = getter();

    value = result;
    initialized = true;

    return result;
  };
}

/**
 * Creates a range whose nodes initially live in a DocumentFragment.
 */
function createRange(nodes: Node[]): RenderRange {
  const start = document.createTextNode("");
  const end = document.createTextNode("");
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
 * Populates a previously empty range.
 */
function populateRange(range: RenderRange, nodes: Node[]): void {
  const parent = range.end.parentNode;

  if (!parent) {
    throw new Error("Cannot populate a detached Suspense range.");
  }

  for (const node of nodes) {
    parent.insertBefore(node, range.end);
  }

  range.nodes = nodes;
}

/**
 * Moves a complete range, including its start and end markers.
 *
 * Nodes moved into a parking lot are marked as parked so Vynn's
 * unmount observer doesn't dispose their owners.
 */
function moveRange(
  range: RenderRange,
  target: Node,
  before: Node | null = null,
): void {
  const fragment = document.createDocumentFragment();
  const parking = target === range.parkingLot;

  let node: Node | null = range.start;

  while (node) {
    const next = node.nextSibling as Node;

    if (parking) {
      markParked(node);
    }

    fragment.appendChild(node);

    if (node === range.end) {
      break;
    }

    node = next;
  }

  target.insertBefore(fragment, before);

  if (!parking) {
    node = range.start;

    while (node) {
      const next = node.nextSibling as Node;

      unmarkParked(node);

      if (node === range.end) {
        break;
      }

      node = next;
    }
  }
}
