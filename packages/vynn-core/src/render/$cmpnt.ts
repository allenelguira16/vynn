import {
  createOwner,
  runWithOwner,
  disposeOwner,
  Owner,
} from "../life-cycle/owner";

import type { JSX } from "../jsx-runtime";

import { untrack } from "../reactivity/untrack";
import { getRenderMode } from "../utils/render-mode";
import {
  rootNodes,
  addUnmountListener,
  isRootNode,
  markParked,
  parkedNodes,
  unmarkParked,
} from "./$cmpnt.util";

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
  Component: ((props?: P) => JSX.Element) | (() => JSX.Element),
) {
  return (props?: P): JSX.Element => {
    const owner = createOwner();
    // owner.Component = Component;
    let marker: Node | undefined;

    if (!getRenderMode()) {
      marker = document.createTextNode("");
      rootNodes.set(marker, owner);
    }

    if (owner.result) return owner.result;

    owner.result = runWithOwner(owner, () => {
      try {
        const resolved = untrack(() => Component(props));

        if (getRenderMode()) return [resolved].flat();

        return [resolved, marker].flat();
      } finally {
        for (const mount of owner.mount) {
          const cleanup = mount();

          if (typeof cleanup === "function") {
            owner.cleanups.push(cleanup);
          }
        }
      }
    });

    return owner.result;
  };
}

export {
  rootNodes,
  addUnmountListener,
  isRootNode,
  markParked,
  parkedNodes,
  unmarkParked,
};
