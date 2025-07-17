import { getSuspenseHandler } from "~/component";
import { runComponentCleanup } from "~/lifecycle";
import { $effect } from "~/reactivity";
import { JSX } from "~/types";
import { createTargetNode, isNil, toArray } from "~/util";

import { getNode } from "../get-node";

/**
 * Render children of jsx
 *
 * @returns cleanup
 */
export function renderChildren(parentNode: Node, children: JSX.Element) {
  const cleanups: (() => void)[] = [];

  function renderRecursive(value: JSX.Element, anchor: Node | null): () => void {
    let nodes: Node[] = [];
    let disposers: (() => void)[] = [];

    const cleanup = () => {
      for (const node of nodes) {
        runComponentCleanup(node);
        if (node.parentNode === parentNode) {
          parentNode.removeChild(node);
        }
      }
      for (const dispose of disposers) dispose();
      nodes = [];
      disposers = [];
    };

    const handler = getSuspenseHandler();
    const disposer = $effect(() => {
      try {
        cleanup();

        const resolvedChildren = value instanceof Function ? value() : value;
        const children = toArray(resolvedChildren);

        for (const child of children) {
          if (isNil(child)) continue;

          if (typeof child === "function") {
            const childAnchor = createTargetNode(`anchor`);
            parentNode.insertBefore(childAnchor, anchor);

            const childDisposer = renderRecursive(child, childAnchor);
            disposers.push(childDisposer);
            nodes.push(childAnchor);
          } else {
            const node = getNode(child);

            // if (!rootNodes.has(node) && node.nextSibling) anchor = node.nextSibling;
            // console.log();
            // console.log(node, node.nextSibling);
            // if (node.isConnected && node.nextElementSibling) {
            //   anchor = node.nextElementSibling;
            // }
            parentNode.insertBefore(node, anchor);
            nodes.push(node);
          }
        }
      } catch (error) {
        if (error instanceof Promise && handler) {
          handler(error);
        } else {
          throw error;
        }
      }
    });

    return () => {
      disposer();
      cleanup();
    };
  }

  const dispose = renderRecursive(children, null);
  cleanups.push(dispose);

  return () => {
    for (const c of cleanups) c();
  };
}
