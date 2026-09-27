import { JSX } from "../jsx";
import { $effect } from "../reactivity/$effect";
import { resolveNode } from "./resolve-node";

export function $dyn(child: () => JSX.Element): Node[] {
  let initialNodes: Node[] = [];
  const markerStart = document.createComment(child.toString());
  const markerEnd = document.createComment(child.toString());

  $effect(() => {
    const newNodes = resolveNode(child);
    if (!initialNodes.length) {
      initialNodes = newNodes;
    }

    if (!markerStart.isConnected || !markerEnd.isConnected) return;

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
