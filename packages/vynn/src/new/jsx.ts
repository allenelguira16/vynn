import { applyProps } from "~/client/apply-props";
import { getNode } from "~/client/get-node";
import { rootNodes } from "~/client/render-component";
import { setRuntimeContext } from "~/context/runtime-context";
import { runComponentCleanup } from "~/lifecycle/component-cleanup";
import { createLifeCycleContext } from "~/lifecycle/create-lifecycle";
import { runLifecycle } from "~/lifecycle/run-lifecycle";
import { $effect } from "~/reactivity/effect";
import { untrack } from "~/reactivity/untrack";
import { JSX } from "~/types/jsx";
import { FC, PropsWithChildren } from "~/types/props";
import { createTargetNode } from "~/util/create-target-node";
import { isNil } from "~/util/is-node-nil";
import { isServer } from "~/util/server-util";
import { flattenArray, toArray } from "~/util/to-array";

import { resolveComponentProps } from "./resolve-component-props";

// const componentCache = new WeakMap<() => Node, Node>();
type Resolvable<T> = T | (() => Resolvable<T>);

type Resolve<T> = T extends () => infer R ? Resolve<R> : T;

export function resolveValue<T>(value: T): Resolve<T> {
  let current = value;

  while (typeof current === "function") {
    current = (current as () => unknown)();
  }

  return current as Resolve<T>;
}

export function resolveArray<T extends readonly unknown[]>(
  values: T,
): { [K in keyof T]: Resolve<T[K]> } {
  return values.map(resolveValue) as {
    [K in keyof T]: Resolve<T[K]>;
  };
}

export function jsx<T extends PropsWithChildren<Record<string, any>>>(
  type: string | FC<T>,
  { children, ...props } = {} as T,
) {
  if (typeof type === "function") {
    // if ((type as any) === Fragment)
    //   return type({
    //     ...props,
    //     children,
    //   } as T) as unknown as () => Node;
    // console.log();

    resolveComponentProps(type, props);
    const context = createLifeCycleContext(window.crypto.randomUUID());

    setRuntimeContext(context);
    const rootNode = createTargetNode("root");

    const Component = untrack<Node>(() =>
      type({
        ...props,
        children,
      } as T),
    );

    const jsxElements = toArray(resolveArray([rootNode, Component])).flat();

    setRuntimeContext(null);
    runLifecycle(rootNode, context);
    rootNodes.add(rootNode);

    return jsxElements;
  }

  const node = document.createElement(type);

  applyProps(node, props);
  renderNodes(node, children);

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

  return node;
}

export function renderNodes(parentNode: ParentNode, children: JSX.Element) {
  function render(nodes: JSX.Element) {
    const oldNodes: (Node | null)[][] = [];

    for (const [i, child] of flattenArray(toArray(nodes)).entries()) {
      // const isFirstRender = true;
      // const node: Node | null = null;
      const anchor = createTargetNode("child-anchor");
      parentNode.appendChild(anchor);

      let resolved: JSX.Element;

      $effect(() => {
        resolved = typeof child === "function" ? child() : child;

        if (typeof resolved === "function") {
          oldNodes[i] = render(resolved());
        } else if (Array.isArray(resolved)) {
          if (oldNodes[i]) {
            oldNodes[i].map((node) => node.remove());
            delete oldNodes[i];
          }
          oldNodes[i] = render(resolved);
        } else if (isNil(resolved)) {
          if (oldNodes[i]) {
            oldNodes[i].map((node) => node.remove());
            delete oldNodes[i];
          }
          //
        } else {
          // console.log(resolved);
          // console.log();
          const node = getNode(resolved);
          if (!oldNodes[i]) {
            parentNode.insertBefore(node, anchor);
          } else if (!Array.isArray(oldNodes[i])) {
            parentNode.replaceChild(node, oldNodes[i]);
          }

          oldNodes[i] = [node];
        }
      });
    }

    return oldNodes;
  }

  render(children);

  return () => {
    // TODO: Dispose
  };
}

// export function renderNodes(parentNode: ParentNode, children: JSX.Element) {
//   if (!parentNode) return () => {};

//   const render = (value: JSX.Element): (Node | null)[] => {
//     const currentNodes: (Node | null)[] = [];

//     for (const child of toArray(value)) {
//       // console.log(child);
//       if (typeof child === "function") {
//         try {
//           currentNodes.push(...render(child()));
//         } catch (error) {
//           if (error instanceof Promise) {
//             const fallback = getSuspenseBoundary();
//             currentNodes.push(...render(fallback));
//           }
//           // throw error;
//         }
//         continue;
//       }

//       if (Array.isArray(child)) {
//         currentNodes.push(...render(child));
//         continue;
//       }

//       if (isNil(child)) {
//         currentNodes.push(null);
//         continue;
//       }

//       currentNodes.push(getNode<Node>(child));
//     }

//     return currentNodes;
//   };

//   const createAnchor = () => {
//     const anchor = createTargetNode("anchor");
//     parentNode.appendChild(anchor);
//     return anchor;
//   };

//   const patch = (oldNodes: (Node | null)[], newNodes: (Node | null)[]) => {
//     for (let i = 0; i < Math.max(oldNodes.length, newNodes.length); i++) {
//       const newNode = newNodes[i];
//       const oldNode = oldNodes[i];
//       const anchor = (anchors[i] ??= createAnchor());

//       if (newNode && rootNodes.has(newNode)) continue;

//       if (!isNil(oldNode) && isNil(newNode)) {
//         parentNode.removeChild(oldNode);
//         oldNodes[i] = newNode;
//         continue;
//       }

//       if (isNil(oldNode) && !isNil(newNode)) {
//         parentNode.insertBefore(newNode, anchor);
//         oldNodes[i] = newNode;
//         continue;
//       }

//       if (!isNil(oldNode) && !isNil(newNode)) {
//         // if (oldNode.isEqualNode(newNode)) {
//         //   console.log("nice");
//         // }
//         // console.log(oldNode, newNode);
//         parentNode.replaceChild(newNode, oldNode);
//         oldNodes[i] = newNode;
//         continue;
//       }

//       if (isNil(oldNode) && isNil(newNode)) {
//         oldNodes[i] = newNode;
//         continue;
//       }
//     }
//   };

//   const anchors: ChildNode[] = [];
//   const oldNodes: (Node | null)[] = [];
//   $effect(function watcher() {
//     // console.log("changed");
//     try {
//       const newNodes = render(children);
//       patch(oldNodes, newNodes);
//     } catch (error) {
//       console.log(error);
//     }
//     // } catch (error) {
//     //   const boundary = getSuspenseBoundary();
//     //   if (error instanceof Promise) {
//     //     if (!boundary) throw new Error("Must be wrapped inside <Suspense>");

//     //     queueMicrotask(() => stopEffect());
//     //     // console.log(render());
//     //     // boundary();
//     //     // const fallback = render(boundary());
//     //     // patch(oldNodes, fallback);

//     //     // error.then(() => {
//     //     //   patch(oldNodes, []);
//     //     // });
//     //   } else {
//     //     throw error;
//     //   }
//     // }
//   });

//   return () => {
//     // onDestroy(() => {
//     //   console.log("hell yeah");
//     // });
//     // console.log(oldNodes);
//     // dispose();
//     // for (const node of oldNodes) if (node) parentNode.removeChild(node);
//   };
// }
