import { setRuntimeContext } from "~/context/runtime-context";
import { runComponentCleanup } from "~/lifecycle/component-cleanup";
import { createLifeCycleContext } from "~/lifecycle/create-lifecycle";
import { runLifecycle } from "~/lifecycle/run-lifecycle";
import { untrack } from "~/reactivity/untrack";
import { JSX } from "~/types/jsx";
import { FC, PropsWithChildren } from "~/types/props";
import { createTargetNode } from "~/util/create-target-node";
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
  _key?: () => string | number,
) {
  resolveComponentProps(type, props);

  const context = createLifeCycleContext(window.crypto.randomUUID());

  setRuntimeContext(context);
  const rootNode = createTargetNode("root");

  const value = untrack<JSX.Element>((): JSX.Element => {
    const v = children ? type({ ...props, children } as T) : type(props as T);

    return v;
    // return typeof v === "function" ? h(v) : v;
  });

  const jsxElements = toArray([rootNode, value]).flat();

  setRuntimeContext(null);
  runLifecycle(rootNode, context);
  rootNodes.add(rootNode);

  return jsxElements as JSX.Element;
}

queueMicrotask(() => {
  if (!isServer) {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const removedNodes of mutation.removedNodes) {
          runComponentCleanup(removedNodes);
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }
});
