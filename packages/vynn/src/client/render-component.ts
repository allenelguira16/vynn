// import { runComponentCleanup } from "~/lifecycle/component-cleanup";
import { runComponentCleanup, setComponentCleanup } from "~/lifecycle/component-cleanup";
import { createOwner, getOwner, runWithOwner } from "~/lifecycle/owner";
import { untrack } from "~/reactivity/untrack";
import { JSX } from "~/types/jsx";
import { FC, PropsWithChildren } from "~/types/props";
import { createAnchor } from "~/util/create-anchor";
import { isServer } from "~/util/server-util";
import { toArray } from "~/util/to-array";

import { resolveComponentProps } from "./resolve-component-props";

export const rootNodes = new WeakSet<Node>();
export const cleanupMap = new WeakMap<Node, (() => Promise<void> | void)[]>();

/**
 * mount a component
 *
 * @param type - The type of the component.
 * @param props - The properties of the component.
 * @param children - The children of the component.
 */
export function renderComponent<T extends PropsWithChildren<Record<string, any>>>(
  type: FC<T>,
  props?: Omit<T, "children">,
  children?: T["children"],
) {
  const parent = getOwner();
  const owner = createOwner(parent);

  return runWithOwner(owner, () => {
    resolveComponentProps(type, props);

    const rootNode = createAnchor(`root-${type.name}-${children?.toString()}`);
    // const endRootNode = createAnchor(`end-root-${type.name}`);

    if (props && children) {
      (props as T).children = children;
    }
    const value = untrack(() => type(props as T));

    const jsxElements = toArray([value, rootNode]).flat();

    rootNodes.add(rootNode);
    // rootNodes.add(endRootNode);
    setComponentCleanup(rootNode, owner.cleanups);

    // queueMicrotask(() => {
    //   if (!startRootNode.parentNode) return;

    //   if (!isServer) {
    //     const observer = new MutationObserver((mutations) => {
    //       for (const mutation of mutations) {
    //         if ([...mutation.removedNodes].includes(startRootNode)) {
    //           runComponentCleanup(startRootNode);
    //         }
    //         // console.log();
    //         // console.log([...mutation.removedNodes].includes(endRootNode));
    //         // for (const removedNodes of mutation.removedNodes) {
    //         //   // if () {
    //         //   //   console.log(startRootNode === removedNodes);
    //         //   // }
    //         //   // console.log(endRootNode === removedNodes);
    //         //   // if (removedNodes === startRootNode) {
    //         //   //   // runComponentCleanup(startRootNode);
    //         //   //   //   for (const cleanup of owner.cleanups) cleanup();
    //         //   //   //   // console.log(owner.cleanups);
    //         //   // }
    //         // }
    //       }
    //     });

    //     observer.observe(startRootNode.parentNode, { childList: true, subtree: true });
    //   }
    // });

    // queueMicrotask(() => {
    //   console.log(owner);
    // });
    queueMicrotask(() => {
      if (!rootNode.parentNode) return;

      if (!isServer) {
        const observer = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            for (const removedNodes of mutation.removedNodes) {
              // console.log(getContext<boolean>("is-suspending"));
              if (removedNodes === rootNode || !rootNode.isConnected) {
                // console.log();
                runComponentCleanup(rootNode);
                // console.log(rootNode);
                // for (const cleanup of owner.cleanups) cleanup();
                // console.log(owner.cleanups);
              }
            }
          }
        });

        observer.observe(rootNode.parentNode, { childList: true, subtree: true });
      }
    });

    return jsxElements as JSX.Element;
  });
}
