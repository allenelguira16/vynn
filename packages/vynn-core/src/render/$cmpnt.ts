import {
  createOwner,
  runWithOwner,
  disposeOwner,
  Owner,
} from "../life-cycle/owner";

import type { JSX } from "../jsx-runtime";

import { untrack } from "../reactivity/untrack";

/**
 * Associates a component's DOM marker with its owner.
 *
 * The marker is used to detect when the component is removed from the DOM so
 * its owner can be disposed.
 */
export const rootNodes = new WeakMap<Node, Owner>();

/**
 * Nodes that are temporarily detached by the renderer but still mounted.
 *
 * Suspense uses this when moving rendered content into a DocumentFragment.
 */
export const parkedNodes = new WeakSet<Node>();

export function isRootNode(node: Node): boolean {
  return rootNodes.has(node);
}

export function markParked(node: Node): void {
  parkedNodes.add(node);
}

export function unmarkParked(node: Node): void {
  parkedNodes.delete(node);
}

/**
 * Creates a component function with its own reactive owner and lifecycle.
 *
 * Each component invocation creates a new owner and a DOM marker used to
 * track the component's lifetime. The component is evaluated within that
 * owner, and registered mount callbacks run after evaluation.
 *
 * The component's owner is automatically disposed when its marker is removed
 * from the DOM.
 *
 * @param Component The component function to wrap.
 * @returns A component function that creates and manages an owner for each invocation.
 */
export function $cmpnt(Component: () => JSX.Element): () => JSX.Element;

export function $cmpnt<P>(
  Component: (props: P) => JSX.Element,
): (props?: P) => JSX.Element;

export function $cmpnt<P>(
  Component: ((props: P) => JSX.Element) | (() => JSX.Element),
) {
  return (props?: P): JSX.Element => {
    const marker = document.createTextNode("");
    const owner = createOwner();

    rootNodes.set(marker, owner);

    const result = runWithOwner(owner, () => [
      untrack(() => Component(props || ({} as P))),
      marker,
    ]);

    try {
      return result;
    } finally {
      for (const mount of owner.mount) {
        const cleanup = mount();

        if (typeof cleanup === "function") {
          owner.cleanups.push(cleanup);
        }
      }
    }
  };
}

/**
 * Disposes component owners when their DOM markers are removed.
 *
 * The observer watches the document subtree so components are cleaned up
 * automatically when their markers leave the DOM.
 */
const pendingDisposals = new Set<Node>();

new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.removedNodes) {
      if (rootNodes.has(node)) {
        pendingDisposals.add(node);
      }
    }
  }

  queueMicrotask(() => {
    for (const node of pendingDisposals) {
      pendingDisposals.delete(node);

      /*
       * The node was intentionally moved into a parking lot.
       * It is still mounted.
       */
      if (parkedNodes.has(node)) {
        continue;
      }

      /*
       * It was removed and has not been reinserted.
       */
      if (!node.isConnected) {
        const owner = rootNodes.get(node);

        // console.log(node);
        if (owner) {
          disposeOwner(owner);
        }
      }
    }
  });
}).observe(document, {
  childList: true,
  subtree: true,
});
