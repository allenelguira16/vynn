import { getSuspenseHandler } from "~/component/suspense";
import { runComponentCleanup } from "~/lifecycle/component-cleanup";
import { $effect } from "~/reactivity/effect";
import { JSX } from "~/types/jsx";
import { createTargetNode } from "~/util/create-target-node";
import { isNil } from "~/util/is-node-nil";
import { toArray } from "~/util/to-array";

import { getNode } from "../get-node";

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

  for (const _child of toArray(children)) {
    let subRenderDisposers: (() => void)[] = [];
    let nodeDisposers: (() => void)[] = [];

    const anchor = createTargetNode("anchor", true);
    parentNode.insertBefore(anchor, baseAnchor);

    const cleanup = () => {
      for (const dispose of subRenderDisposers) dispose?.();
      subRenderDisposers = [];

      for (const dispose of nodeDisposers) dispose();
      nodeDisposers = [];
    };

    const handler = getSuspenseHandler();
    const effectDisposer = $effect(() => {
      try {
        cleanup();

        const child = typeof _child === "function" ? _child() : _child;

        if (isNil(child)) {
          return;
        }

        if (typeof child === "function" || Array.isArray(child)) {
          const dispose = renderChildren(parentNode, child, anchor);
          subRenderDisposers.push(dispose);
          return;
        }

        const node = getNode(child);
        parentNode.insertBefore(node, anchor);

        nodeDisposers.push(() => {
          runComponentCleanup(node);
          if (node.parentNode === parentNode) parentNode.removeChild(node);
        });
      } catch (error) {
        if (error instanceof Promise && handler) {
          handler(error);
        } else {
          throw error;
        }
      }
    });

    renderDisposers.push(() => {
      cleanup();
      if (anchor.parentNode === parentNode) anchor.remove();
    });

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
