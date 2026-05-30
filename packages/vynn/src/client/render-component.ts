import { setRuntimeContext } from "~/context/runtime-context";
import { createLifeCycleContext } from "~/lifecycle/create-lifecycle";
import { runLifecycle } from "~/lifecycle/run-lifecycle";
import { untrack } from "~/reactivity/untrack";
import { JSX } from "~/types/jsx";
import { FC, PropsWithChildren } from "~/types/props";
import { createAnchor } from "~/util/create-target-node";
import { toArray } from "~/util/to-array";

import { resolveComponentProps } from "./resolve-component-props";
import { isServer } from "~/util/server-util";
import { runComponentCleanup } from "~/lifecycle/component-cleanup";

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
  resolveComponentProps(type, props);

  const context = createLifeCycleContext(window.crypto.randomUUID());

  setRuntimeContext(context);
  // anchorHelper.init();
  const rootNode = createAnchor(`root-${type.name}`, true);
  // anchorHelper.set(rootNode);

  const value = untrack<JSX.Element>(
    (): JSX.Element => (children ? type({ ...props, children } as T) : type(props as T)),
  );

  const jsxElements = toArray([rootNode, typeof value === "function" ? value : value]).flat();

  setRuntimeContext(null);
  runLifecycle(rootNode, context);
  rootNodes.add(rootNode);

  return jsxElements as JSX.Element;
}

queueMicrotask(() => {
  // if (!rootNode.parentNode) return;

  if (!isServer) {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const removedNodes of mutation.removedNodes) {
          if (rootNodes.has(removedNodes)) {
            // console.log("removed", removedNodes);
            // console.log(removedNodes);
            // console.log(clientStreamContext().memo.has(type as any));
            runComponentCleanup(removedNodes);
            // observer.disconnect();
          }
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }
});
