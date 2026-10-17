import { enterAsyncBoundary } from "../components/boundary";
import type { JSX } from "../jsx-runtime";
import { onDestroy } from "../life-cycle/on-destroy";
import { $effect } from "../reactivity/$effect";
import { getRenderMode } from "../context/render-mode";
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
export function $dyn(child: () => JSX.Element): JSX.Element {
  const mode = getRenderMode();

  if (mode) {
    const promises: Promise<any>[] = [];
    enterAsyncBoundary((promise) => {
      promises.push(promise);
    });
    let nodes: JSX.Element[] = [];

    $effect(() => {
      nodes = resolveNode(child);
    });

    if (!promises.length) {
      return nodes;
    }

    return createSSRAsync(
      () => [],
      () => nodes as unknown as SSR_NODE[],
      promises,
    ) as unknown as JSX.Element;
  }

  // const markerStart = document.createComment("dynamic");
  const marker = document.createComment("dynamic-marker");

  let nodes: Node[] = [];

  $effect(() => {
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
