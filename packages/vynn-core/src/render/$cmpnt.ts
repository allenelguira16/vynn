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
      marker,
      untrack(() => Component(props || ({} as P))),
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
new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.removedNodes) {
      if (rootNodes.has(node)) {
        const owner = rootNodes.get(node);

        if (owner) {
          disposeOwner(owner);
        }

        rootNodes.delete(node);
      }
    }
  }
}).observe(document, {
  childList: true,
  subtree: true,
});
