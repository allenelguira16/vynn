import type { JSX } from "../jsx-runtime";
import { $renderEffect } from "../reactivity/$effect";
import { getRenderMode } from "../context/render-mode";
import { resolveNode, resolveSSRChild } from "./resolve-node";

/**
 * Creates a reactive DOM range from a child expression.
 *
 * On the server, pending expressions are represented by deferred SSR nodes.
 * On the client, the expression remains reactive.
 */
export function $nodes(child: () => JSX.Element): JSX.Element {
  if (getRenderMode()) {
    return resolveSSRChild(child) as unknown as JSX.Element;
  }

  const marker = document.createTextNode("");
  let nodes: Node[] = [];

  $renderEffect(() => {
    for (const node of nodes) {
      (node as ChildNode).remove();
    }

    nodes = resolveNode(child);

    queueMicrotask(() => {
      if (marker.parentNode) {
        for (const node of nodes) {
          marker.parentNode.insertBefore(node, marker);
        }
      }
    });
  });

  return [...nodes, marker];
}
