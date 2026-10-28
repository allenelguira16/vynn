import type { JSX } from "../jsx-runtime";
import { $renderEffect } from "../reactivity/$effect";
import { resolveNode, resolveSSRChild } from "./resolve-node";
import { isServer } from "../context/is-server-context";

// Associates each region's start marker with its end marker.
// This allows an outer region to clean up nodes inserted later by nested regions.
const rangeEndByStart = new WeakMap<Node, Node>();

export function $nodes(child: () => JSX.Element): JSX.Element {
  if (isServer()) {
    return resolveSSRChild(child) as unknown as JSX.Element;
  }

  const start = document.createTextNode("");
  const end = document.createTextNode("");

  rangeEndByStart.set(start, end);

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

      const parent = end.parentNode;

      if (!parent || start.parentNode !== parent) {
        return;
      }

      const nextSet = new Set(nextNodes);

      // Remove obsolete nodes, including the complete live ranges
      // of nested $nodes regions that were inserted asynchronously.
      for (const node of previousNodes) {
        if (nextSet.has(node) || node.parentNode !== parent) {
          continue;
        }

        const rangeEnd = rangeEndByStart.get(node);

        if (rangeEnd && rangeEnd.parentNode === parent) {
          // Confirm that the end marker is reachable from the start.
          let cursor: Node | null = node;

          while (cursor && cursor !== rangeEnd) {
            cursor = cursor.nextSibling;
          }

          if (cursor === rangeEnd) {
            // Remove the live range, not just the originally tracked nodes.
            let current: Node | null = node;

            while (current) {
              const next: Node | null = current.nextSibling;
              parent.removeChild(current);

              if (current === rangeEnd) {
                break;
              }

              current = next;
            }

            continue;
          }
        }

        // Ordinary node, or a range whose markers are no longer together.
        if (node.parentNode === parent) {
          parent.removeChild(node);
        }
      }

      // Reconcile the new output immediately before the end marker.
      for (const node of nextNodes) {
        parent.insertBefore(node, end);
      }
    };

    if (end.parentNode) {
      commit();
    } else {
      // Initial evaluation can happen before the parent inserts the markers.
      queueMicrotask(commit);
    }
  });

  return [start, ...nodes, end];
}
