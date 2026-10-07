import { $effect } from "../reactivity/$effect";
import { JSX } from "../jsx-runtime";
import { resolveNode } from "./resolve-node";
import { IS_SERVER_ENV } from "../utils/is-server-env";

/**
 * Inserts reactive content into a DOM node.
 *
 * When `child` is a function, it is evaluated reactively and the inserted
 * nodes are updated whenever its dependencies change. Existing nodes are
 * reused when possible, while added or removed nodes are synchronized with
 * the new result.
 *
 * @param element The DOM node that will contain the inserted content.
 * @param child The content to insert, or a function that produces the content reactively.
 * @param before The node to insert the content before, or `null` to append it.
 */
export function $insert<E extends HTMLElement>(
  element: E,
  child: (() => JSX.Element) | JSX.Element,
  before: Node | null = null,
): void {
  if (IS_SERVER_ENV) {
    const newNodes = resolveNode(
      typeof child === "function" ? child : () => child,
    );

    for (const node of [newNodes].flat()) {
      // console.log(node);
      element.appendChild(node);
    }
    return;
  }

  let oldNodes: Node[] = [];

  $effect(() => {
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
      element.insertBefore(newNodes[i], before);
    }

    // Remove nodes that no longer exist.
    for (let i = newNodes.length; i < oldNodes.length; i++) {
      element.removeChild(oldNodes[i]);
    }

    oldNodes = newNodes;
  });
}
