import type { JSX } from "../jsx-runtime";
import { $renderEffect } from "../reactivity/$effect";
import { resolveNode, resolveSSRChild } from "./resolve-node";
import { isServer } from "../context/is-server-context";

export function $nodes(child: () => JSX.Element): JSX.Element {
  if (isServer()) {
    return resolveSSRChild(child) as unknown as JSX.Element;
  }

  const marker = document.createTextNode("");
  let nodes: Node[] = [];
  let revision = 0;

  $renderEffect(() => {
    // Resolve first. If NotReadyError occurs, preserve the current DOM.
    const nextNodes = resolveNode(child);
    const previousNodes = nodes;

    nodes = nextNodes;

    // Invalidate DOM commits queued by older successful evaluations.
    const currentRevision = ++revision;

    const commit = () => {
      if (currentRevision !== revision) {
        return;
      }

      const parent = marker.parentNode;

      if (!parent) {
        return;
      }

      // Remove only nodes that are no longer part of this range.
      for (const node of previousNodes) {
        if (!nextNodes.includes(node)) {
          parent.removeChild(node);
        }
      }

      // Reconcile the range immediately before its end marker.
      for (const node of nextNodes) {
        parent.insertBefore(node, marker);
      }
    };

    if (marker.parentNode) {
      commit();
    } else {
      // Initial evaluation can happen before the parent inserts the marker.
      queueMicrotask(commit);
    }
  });

  return [...nodes, marker];
}
