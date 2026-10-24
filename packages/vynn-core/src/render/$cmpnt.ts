import type { JSX } from "../jsx-runtime";
import { createOwner, runWithOwner } from "../life-cycle/owner";
import { untrack } from "../reactivity/untrack";
import {
  rootNodes,
  addUnmountListener,
  isRootNode,
  markParked,
  parkedNodes,
  unmarkParked,
} from "./$cmpnt.util";
import { runAfterHydration } from "../client/hydration";
import { isServer } from "../context/is-server-context";

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

    if (!isServer()) {
      marker = document.createTextNode("");
      rootNodes.set(marker, owner);
    }

    // const result =
    return runWithOwner(owner, () => {
      try {
        const resolved = untrack(() => Component(props));

        if (isServer()) return [resolved].flat();

        return [resolved, marker].flat();
      } finally {
        if (!!owner.mount.length) {
          runAfterHydration(() => {
            for (const mount of owner.mount) {
              const cleanup = mount();

              if (typeof cleanup === "function") {
                owner.cleanups.push(cleanup);
              }
            }
          });
        }
      }
    });

    // return function read() {
    // return runWithOwner(owner, () => result);
    // } as unknown as JSX.Element;
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
