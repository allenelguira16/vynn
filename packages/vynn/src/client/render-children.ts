import { getSuspenseHandler } from "~/component/suspense";
import { runComponentCleanup } from "~/lifecycle/component-cleanup";
import { $effect } from "~/reactivity/effect";
import { JSX } from "~/types/jsx";
import { createTargetNode } from "~/util/create-target-node";
import { isNil } from "~/util/is-node-nil";
import { toArray } from "~/util/to-array";

import { getNode } from "./get-node";

/**
 * Render children of jsx
 *
 * @returns cleanup
 */
export function renderChildren(
  parentNode: Node,
  children: JSX.Element,
  baseAnchor: Node | null = null,
) {
  if (!isNil(baseAnchor) && !baseAnchor?.parentNode) return () => {};

  let renderDisposers: (() => void)[] = [];

  for (const child of toArray(children)) {
    // let isFirstRender = true;
    let subRenderDisposers: (() => void)[] = [];
    let nodeDisposers: (() => void)[] = [];

    const anchor = createTargetNode("anchor");
    parentNode.insertBefore(anchor, baseAnchor);

    const cleanup = () => {
      for (const dispose of subRenderDisposers) dispose?.();
      for (const dispose of nodeDisposers) dispose();

      subRenderDisposers = [];
      nodeDisposers = [];
    };

    const handler = getSuspenseHandler();
    const effectDisposer = $effect(() => {
      try {
        cleanup();

        const resolved = typeof child === "function" ? child() : child;

        if (isNil(resolved)) {
          return;
        }

        if (typeof resolved === "function" || Array.isArray(resolved)) {
          const dispose = renderChildren(parentNode, resolved, anchor);
          subRenderDisposers.push(dispose);
          renderDisposers.push(dispose);
          return;
        }

        const node = getNode<Element>(resolved);
        parentNode.insertBefore(node, anchor);

        nodeDisposers.push(() => runComponentCleanup(node));
        nodeDisposers.push(() => node.remove());
      } catch (error) {
        if (error instanceof Promise && handler) {
          handler(error);
        } else {
          throw error;
        }
      } finally {
        // isFirstRender = false;
      }
    });

    renderDisposers.push(() => cleanup());
    renderDisposers.push(() => anchor.remove());
    renderDisposers.push(effectDisposer);
  }

  return () => {
    for (const dispose of renderDisposers) {
      dispose();
    }

    renderDisposers = [];
  };
}

// function onDoneHydration(fn: () => void) {
//   if (!ssrDomWalker().isHydrating) {
//     fn();
//     return;
//   }
//   requestAnimationFrame(() => onDoneHydration(fn));
// }

// export function renderChildren(parentNode: Node, children: JSX.Element) {
//   const cleanups: (() => void)[] = [];

//   function renderRecursive(value: JSX.Element, anchor: Node | null): () => void {
//     let nodes: Node[] = [];
//     let disposers: (() => void)[] = [];

//     const cleanup = () => {
//       for (const node of nodes) {
//         runComponentCleanup(node);
//         if (node.parentNode === parentNode) {
//           parentNode.removeChild(node);
//         }
//       }
//       for (const dispose of disposers) dispose();
//       nodes = [];
//       disposers = [];
//     };

//     const handler = getSuspenseHandler();
//     const disposer = $effect(() => {
//       try {
//         cleanup();

//         const resolvedChildren = value instanceof Function ? value() : value;
//         const children = toArray(resolvedChildren);

//         for (const child of children) {
//           if (isNil(child)) continue;

//           if (typeof child === "function") {
//             const childAnchor = createTargetNode(`anchor`);
//             parentNode.insertBefore(childAnchor, anchor);

//             const childDisposer = renderRecursive(child, childAnchor);
//             disposers.push(childDisposer);
//             nodes.push(childAnchor);
//           } else {
//             const node = getNode(child);

//             parentNode.insertBefore(node, anchor);
//             nodes.push(node);
//           }
//         }
//       } catch (error) {
//         if (error instanceof Promise && handler) {
//           handler(error);
//         } else {
//           throw error;
//         }
//       }
//     });

//     return () => {
//       disposer();
//       cleanup();
//     };
//   }

//   const dispose = renderRecursive(children, null);
//   cleanups.push(dispose);

//   return () => {
//     for (const c of cleanups) c();
//   };
// }
