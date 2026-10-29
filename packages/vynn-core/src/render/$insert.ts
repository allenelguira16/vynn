import { $renderEffect } from "../reactivity/$effect";
import type { JSX } from "../jsx-runtime";
import { resolveNode, resolveSSRChild } from "./resolve-node";
import type { SSR_ELEMENT } from "./resolve-node";
import { isServer } from "../context/is-server-context";

/**
 * Inserts missing nodes around already-hydrated nodes without moving those nodes.
 *
 * Hydration reuses nodes that are already children of the target element. Only
 * newly-created markers or nodes should be inserted during the initial pass.
 */
function insertInitialNodes<E extends HTMLElement>(
  element: E,
  nodes: Node[],
  before: Node | null,
): void {
  let previous: Node | null = null;

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];

    if (node.parentNode === element) {
      // Preserve the server's existing node and its position.
      previous = node;
      continue;
    }

    let anchor: Node | null = null;

    if (previous?.parentNode === element) {
      // Place the new node after the preceding rendered node.
      anchor = previous.nextSibling;
    } else {
      // A leading marker belongs immediately before the next hydrated node.
      for (let j = i + 1; j < nodes.length; j++) {
        if (nodes[j].parentNode === element) {
          anchor = nodes[j];
          break;
        }
      }

      // Empty/new content still needs to respect an explicit insertion anchor.
      if (anchor === null && before?.parentNode === element) {
        anchor = before;
      }
    }

    element.insertBefore(node, anchor);
    previous = node;
  }
}

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

    if (oldNodes.length === 0) {
      insertInitialNodes(element, newNodes, before);
    } else {
      const length = Math.min(oldNodes.length, newNodes.length);

      // Replace existing nodes.
      for (let i = 0; i < length; i++) {
        if (oldNodes[i] !== newNodes[i]) {
          element.replaceChild(newNodes[i], oldNodes[i]);
        }
      }

      // Add new nodes immediately before the caller's anchor, when provided.
      const reference = before?.parentNode === element ? before : null;

      for (let i = length; i < newNodes.length; i++) {
        element.insertBefore(newNodes[i], reference);
      }

      // Remove nodes that no longer exist.
      for (let i = newNodes.length; i < oldNodes.length; i++) {
        if (oldNodes[i].parentNode === element) {
          element.removeChild(oldNodes[i]);
        }
      }
    }

    oldNodes = newNodes;
  });
}
