import { $effect } from "../reactivity/$effect";
import { JSX } from "../jsx-runtime";
import { resolveNode } from "./resolve-node";
import { getRenderMode } from "../utils/render-mode";
import { withRenderBoundary } from "../components/boundary";

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
) {
  return withRenderBoundary(element, () => {
    if (getRenderMode()) {
      // let oldNodes: Node[] = [];
      const newNodes = resolveNode(
        typeof child === "function" ? child : () => child,
      );

      // for (const node of [oldNodes].flat()) {
      //   element.removeChild(node);
      // }

      for (const node of [newNodes].flat()) {
        element.appendChild(node);
      }

      // oldNodes = newNodes;
      return;
    }

    // parents.push(element);
    let oldNodes: Node[] = [];

    return $effect(() => {
      const newNodes = resolveNode(
        typeof child === "function" ? child : () => child,
      );

      // oldNodes = newNodes;
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
  });
}
