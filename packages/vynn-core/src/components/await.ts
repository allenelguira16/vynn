import type { JSX } from "../types/jsx";
import { $cmpnt, markParked, unmarkParked } from "../render/$cmpnt";
import { createSSRAsync, resolveNode, SSR_NODE } from "../render/resolve-node";
import { enterAsyncBoundary } from "./boundary";
import { $state } from "../reactivity/$state";
import { $renderEffect } from "../reactivity/$effect";
import { getRenderMode } from "../context/render-mode";
import { NotReadyError } from "../reactivity/not-ready-error";

type RenderRange = {
  start: Comment;
  end: Comment;
  nodes: Node[];
  parkingLot: DocumentFragment;
};

type PendingPromise = Promise<unknown>;

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
  const mode = getRenderMode();
  if (mode === "sync") {
    return props.fallback;
  }
  if (mode === "async") {
    let pending: Promise<any>[] = [];

    enterAsyncBoundary((promise) => {
      pending.push(promise);
    });

    try {
      return props.children;
    } catch (error) {
      if (!(error instanceof NotReadyError)) {
        throw error;
      }

      return createSSRAsync(
        () => resolveNode(() => props.fallback) as unknown as SSR_NODE[],
        () => resolveNode(() => props.children) as unknown as SSR_NODE[],
        pending,
      ) as unknown as JSX.Element;
    }
  }

  let resolved = false;
  let hasPromise = false;

  const markerEnd = document.createComment("");
  const view = $state<Node[]>([]);

  let nodes: Node[] = [];
  const pending = new Set<Promise<unknown>>();

  const fallback = resolveNode(() => props.fallback);
  let children: Node[] = [];

  enterAsyncBoundary((promise) => {
    hasPromise = true;

    if (pending.has(promise)) {
      return;
    }

    pending.add(promise);

    if (!resolved) {
      view.value = fallback;
    }

    promise.then(
      () => {
        pending.delete(promise);

        if (pending.size === 0) {
          resolved = true;
          view.value = children;
        }
      },
      (error) => {
        pending.delete(promise);
        console.error("Await child promise rejected:", error);
      },
    );
  });

  children = resolveNode(() => props.children);

  // Keep the reactive view active even when the async work
  // is discovered later by a nested effect.
  if (!hasPromise) {
    view.value = children;
  }

  $renderEffect(() => {
    for (const node of nodes) {
      (node as ChildNode).remove();
    }

    nodes = view.value;

    for (const node of nodes) {
      markerEnd.parentNode?.insertBefore(node, markerEnd);
    }
  });

  return [nodes, markerEnd];
});
