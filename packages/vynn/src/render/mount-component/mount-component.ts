import { setRuntimeContext } from "~/context";
import { createLifeCycleContext, runComponentCleanup, runLifecycle } from "~/lifecycle";
import { untrack } from "~/reactivity";
import { FC, JSX, PropsWithChildren } from "~/types";
import { isServer } from "~/util";
import { toArray } from "~/util";

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
export function mountComponent<T extends PropsWithChildren<Record<string, any>>>(
  type: FC<T>,
  props?: Omit<T, "children">,
  children?: T["children"],
  _key?: () => string | number,
) {
  resolveComponentProps(type, props);

  const key = _key ? _key().toString() + type.toString() : undefined;
  const context = createLifeCycleContext(key);

  setRuntimeContext(context);
  const rootNode = document.createTextNode("");

  const value = untrack(() =>
    children ? type({ ...(props as unknown as T), children } as unknown as T) : type(props as T),
  );

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
