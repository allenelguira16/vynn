import type { JSX } from "../types/jsx";
import { $cmpnt } from "../render/$cmpnt";
import { resolveNode } from "../render/resolve-node";
import { enterAsyncBoundary } from "./boundary";
import { $state } from "../reactivity/$state";
import { $effect } from "../reactivity/$effect";

/**
 * Displays a fallback while the children are initially loading.
 *
 * The fallback is shown only during the first pending state.
 * Once the children have been displayed successfully, subsequent async
 * operations keep the current children visible.
 *
 * @param props The fallback content and children to render.
 * @returns The rendered content.
 */
export const Await = $cmpnt(function Suspense(props: {
  fallback?: JSX.Element;
  children: JSX.Element;
}): JSX.Element {
  let resolved = false;
  const markerStart = document.createComment("");
  const markerEnd = document.createComment("");

  const view = $state<Node[]>([]);

  let nodes: Node[] = [];
  let hasPromise = false;

  enterAsyncBoundary((promise) => {
    hasPromise = true;
    if (!resolved) {
      view.value = fallback;
    }

    promise.then(() => {
      view.value = children;
      resolved = true;
    });
  });

  const fallback = resolveNode(() => props.fallback);
  const children = resolveNode(() => props.children);

  if (!hasPromise) {
    return children;
  }

  $effect(() => {
    for (const node of nodes) {
      // markerEnd.parentNode?.removeChild(node);
      (node as ChildNode).remove();
    }

    nodes = view.value;

    for (const node of nodes) {
      markerEnd.parentNode?.insertBefore(node, markerEnd);
    }
  });

  return [markerStart, nodes, markerEnd];
});
