import type { JSX } from "../jsx-runtime";
import { $effect } from "../reactivity/$effect";
import { IS_SERVER_ENV } from "../utils/is-server-env";
import { createSSRNode, resolveNode } from "./resolve-node";

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
  if (IS_SERVER_ENV) {
    // try {
    // let resolved: Node[] = [];

    // $effect(() => {
    let resolved = resolveNode(child);
    // console.log(resolved);
    // });

    return resolved;
  }

  let initialNodes: Node[] = [];
  const markerStart = document.createTextNode("");
  const markerEnd = document.createTextNode("");

  $effect(() => {
    const newNodes = resolveNode(child);

    if (!initialNodes.length) {
      initialNodes = newNodes;
    }

    // console.log(initialNodes);
    replaceElementsBetween(newNodes);
  });

  function replaceElementsBetween(newElementsArray: Node[]) {
    const parent = markerStart.parentNode;
    let current = markerStart.nextSibling;

    while (current && current !== markerEnd) {
      const next = current.nextSibling;

      parent?.removeChild(current);
      current = next;
    }

    for (const node of newElementsArray) {
      parent?.insertBefore(node, markerEnd);
    }
  }

  return [markerStart, ...initialNodes, markerEnd];
}
