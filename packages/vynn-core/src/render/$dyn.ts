import type { JSX } from "../jsx-runtime";
import { $effect } from "../reactivity/$effect";
import { isPromiseLike } from "../reactivity/is-promise-like";
import { transaction } from "../reactivity/transaction";
import { getRenderMode } from "../utils/render-mode";
import { createSSRAsync, resolveNode, SSR_NODE } from "./resolve-node";

/**
 * Creates a reactive DOM range from a child expression.
 *
 * The child function is evaluated reactively, and the nodes produced by it
 * replace the previous contents of the range whenever its dependencies change.
 *
 * @param child A function that returns the content to render reactively.
 * @returns The start marker, current child nodes, and end marker for the range.
 */
export function $dyn(child: () => JSX.Element): JSX.Element[] {
  const mode = getRenderMode();

  if (mode) {
    return resolveNode(child);
  }

  const markerStart = document.createTextNode("");
  const markerEnd = document.createTextNode("");

  let nodes: Node[] = [];

  $effect(() => {
    nodes = resolveNode(child);
    replaceElementsBetween(nodes);
  });

  function replaceElementsBetween(newNodes: Node[]) {
    const parent = markerStart.parentNode;

    // The initial effect runs before these markers are mounted.
    if (!parent) return;

    let current = markerStart.nextSibling;

    // Remove the entire current dynamic range.
    while (current && current !== markerEnd) {
      const next = current.nextSibling;

      parent.removeChild(current);
      current = next;
    }

    // Insert the new content into the same range.
    for (const node of newNodes) {
      parent.insertBefore(node, markerEnd);
    }
  }

  return [markerStart, ...nodes, markerEnd];
}
