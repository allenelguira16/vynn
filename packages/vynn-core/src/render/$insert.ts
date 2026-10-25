import { $renderEffect } from "../reactivity/$effect";
import type { JSX } from "../jsx-runtime";
import { resolveNode, resolveSSRChild } from "./resolve-node";
import type { SSR_ELEMENT } from "./resolve-node";
import { isServer } from "../context/is-server-context";

/**
 * Inserts reactive content into an element.
 *
 * On the server, children are resolved directly and deferred async nodes
 * are preserved in the SSR tree.
 *
 * On the client, children are synchronized reactively.
 */
export function $insert<E extends HTMLElement>(
  element: E,
  child: (() => JSX.Element) | JSX.Element,
  before: Node | null = null,
): void | (() => void) {
  if (isServer()) {
    const parent = element as unknown as SSR_ELEMENT;

    const renderChild = typeof child === "function" ? child : () => child;

    const nodes = resolveSSRChild(renderChild);
    const reference = before as unknown as SSR_ELEMENT | null;

    for (const node of nodes) {
      parent.insertBefore(node, reference);
    }

    return;
  }

  let oldNodes: Node[] = [];

  return $renderEffect(() => {
    const newNodes = resolveNode(
      typeof child === "function" ? child : () => child,
    );

    const length = Math.min(oldNodes.length, newNodes.length);

    // Replace existing nodes.
    for (let i = 0; i < length; i++) {
      if (oldNodes[i] !== newNodes[i]) {
        element.replaceChild(newNodes[i], oldNodes[i]);
      }
    }

    // Add new nodes.
    for (let i = length; i < newNodes.length; i++) {
      element.insertBefore(newNodes[i], null);
    }

    // Remove nodes that no longer exist.
    for (let i = newNodes.length; i < oldNodes.length; i++) {
      element.removeChild(oldNodes[i]);
    }

    oldNodes = newNodes;
  });
}
