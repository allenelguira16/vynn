import { setRuntimeContext } from "~/context/runtime-context";
import { runComponentCleanup } from "~/lifecycle/component-cleanup";
import { createLifeCycleContext } from "~/lifecycle/create-lifecycle";
import { runLifecycle } from "~/lifecycle/run-lifecycle";
import { untrack } from "~/reactivity/untrack";
import { rootNodes } from "~/client/render-component";
import { resolveComponentProps } from "~/client/resolve-component-props";
import { FC, PropsWithChildren } from "~/types/props";
import { createTargetNode } from "~/util/create-target-node";
import { isServer } from "~/util/server-util";
import { toArray } from "~/util/to-array";

export function renderComponent<T extends PropsWithChildren<Record<string, any>>>(
  type: FC<T>,
  props = {} as Omit<T, "children">,
  children?: T["children"],
) {
  resolveComponentProps(type);
  // function resolve(item: any) {
  //   console.log("ayep");
  //   if (typeof item === "function") return item();

  //   return item;
  // }

  // console.log(getSuspenseHandler());
  // try {
  const context = createLifeCycleContext(window.crypto.randomUUID());
  setRuntimeContext(context);

  const rootNode = createTargetNode("root");
  const value = untrack(() => {
    const value = type({ ...props, children } as T);
    return typeof value === "function" ? value() : value;
  });

  const jsxElements = toArray([rootNode, value]).flat();

  setRuntimeContext(null);
  runLifecycle(rootNode, context);
  rootNodes.add(rootNode);

  return jsxElements;
  // } catch (error) {
  //   if (error instanceof Promise) {
  //     console.log(error);
  //     // return renderComponent(type, props, children);
  //   }
  // }
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
