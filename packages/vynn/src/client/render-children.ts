import { getSuspenseHandler } from "~/component/suspense";
import { runComponentCleanup } from "~/lifecycle/component-cleanup";
import { $effect } from "~/reactivity/effect";
import { JSX } from "~/types/jsx";
import { createAnchor } from "~/util/create-target-node";
import { isNil } from "~/util/is-node-nil";
import { flattenArray, toArray } from "~/util/to-array";

import { getNode } from "./get-node";

/**
 * Render children of jsx
 *
 * @returns cleanup
 */
export function renderChildren(parentNode: Node, children: JSX.Element, baseAnchor: Node) {
  if (!isNil(baseAnchor) && !baseAnchor?.parentNode) return () => {};

  let renderDisposers: (() => void)[] = [];

  for (const child of flattenArray(toArray(children))) {
    let subRenderDisposers: (() => void)[] = [];
    let nodeDisposers: (() => void)[] = [];

    // let anchor: ChildNode;
    const anchor = createAnchor(`anchor-${child}`);
    parentNode.insertBefore(anchor, baseAnchor);

    // anchorHelper.set(anchor);

    let node: Element | null = null;

    const handler = getSuspenseHandler();
    const effectDisposer = $effect(() => {
      try {
        subRenderDisposers.map((dispose) => dispose());
        subRenderDisposers = [];

        const resolved = typeof child === "function" ? child() : child;

        // if (!anchor) {
        //   anchor = createAnchor("");
        //   parentNode.insertBefore(anchor, baseAnchor);
        //   renderDisposers.push(() => anchor && anchor.remove());
        // }
        // anchor.textContent = `anchor-${child}`;

        nodeDisposers.push(() => node && runComponentCleanup(node));
        nodeDisposers.push(() => node && node.remove());

        if (isNil(resolved)) {
          if (node) {
            parentNode.removeChild(node);
            node = null;
          }
          // const dispose = renderChildren(parentNode, anchor, anchor);
          // subRenderDisposers.push(dispose);
        } else if (typeof resolved === "function") {
          const dispose = renderChildren(parentNode, resolved, anchor);
          subRenderDisposers.push(dispose);
        } else if (Array.isArray(resolved)) {
          const dispose = renderChildren(parentNode, resolved, anchor);
          subRenderDisposers.push(dispose);
        } else {
          const newNode = getNode<Element>(resolved);
          // console.log(rootNodes.has(newNode));
          if (!node) {
            if (!newNode.isConnected) {
              parentNode.insertBefore(newNode, anchor);
            } else {
              parentNode.insertBefore(baseAnchor, newNode.nextSibling);
              parentNode.insertBefore(anchor, newNode.nextSibling);
            }
          } else {
            parentNode.replaceChild(newNode, node);
          }
          node = newNode;
        }
      } catch (error) {
        if (error instanceof Promise && handler) {
          handler(error);
        } else {
          throw error;
        }
      }
    });

    const cleanup = () => {
      for (const dispose of subRenderDisposers) dispose();
      for (const dispose of nodeDisposers) dispose();

      subRenderDisposers = [];
      nodeDisposers = [];
      effectDisposer();
      anchor.remove();
    };

    renderDisposers.push(cleanup);
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
