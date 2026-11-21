import type { JSX } from "../../types/jsx";
import { runAfterHydration } from "../../client/hydration";
import { createOwner, runWithOwner } from "../../life-cycle/owner";
import { untrack } from "../../reactivity/effect";
import {
  addUnmountListener,
  isRootNode,
  markParked,
  parkedNodes,
  rootNodes,
  unmarkParked,
} from "./component-nodes";

export function $cmpnt(Component: () => JSX.Element): () => JSX.Element;
export function $cmpnt<P>(Component: (props: P) => JSX.Element): (props?: P) => JSX.Element;
export function $cmpnt<P>(Component: ((props?: P) => JSX.Element) | (() => JSX.Element)) {
  return (props?: P): JSX.Element => {
    const owner = createOwner();
    const marker = document.createTextNode("");
    rootNodes.set(marker, owner);

    return runWithOwner(owner, () => {
      try {
        const resolved = untrack(() => Component(props));
        return [resolved, marker].flat();
      } finally {
        if (owner.mount.length) {
          runAfterHydration(() => {
            for (const mount of owner.mount) {
              const cleanup = mount();
              if (typeof cleanup === "function") owner.cleanups.push(cleanup);
            }
          });
        }
      }
    });
  };
}

export { rootNodes, addUnmountListener, isRootNode, markParked, parkedNodes, unmarkParked };