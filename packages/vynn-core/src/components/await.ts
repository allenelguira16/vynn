import type { JSX } from "../types/jsx";
import { $cmpnt } from "../render/$cmpnt";
import { createSSRAsync, resolveNode, SSR_NODE } from "../render/resolve-node";
import { enterAsyncBoundary } from "../context/async-boundary";
import { $state } from "../reactivity/$state";
import { $renderEffect } from "../reactivity/$effect";
import { getRenderMode } from "../context/render-mode";
import { memo } from "../utils/memo";
import { getOwner, runWithOwner } from "../life-cycle/owner";

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
  const owner = getOwner()!;

  const fallback = memo(() => runWithOwner(owner, () => props.fallback));
  const children = memo(() => runWithOwner(owner, () => props.children));

  // if (mode === "sync") {
  //   let isHasPromise = false;
  //   enterAsyncBoundary(() => {
  //     isHasPromise = true;
  //   });
  //   try {
  //     props.children;
  //   } finally {
  //     if (isHasPromise) return props.fallback;
  //     return props.children;
  //   }
  // }
  if (mode) {
    let pending: Promise<any>[] = [];

    enterAsyncBoundary((promise) => {
      pending.push(promise);
    });

    try {
      children();
    } finally {
      if (!pending.length) {
        return children();
      }

      return createSSRAsync(
        () => resolveNode(fallback) as unknown as SSR_NODE[],
        () => resolveNode(children) as unknown as SSR_NODE[],
        pending,
      ) as unknown as JSX.Element;
    }
  }

  let resolved = false;
  let hasPromise = false;

  const markerEnd = document.createTextNode("");
  const view = $state<Node[]>([]);

  let nodes: Node[] = [];
  const pending = new Set<Promise<unknown>>();

  enterAsyncBoundary((promise) => {
    hasPromise = true;

    if (pending.has(promise)) {
      return;
    }

    pending.add(promise);

    if (!resolved && !("__lazy" in promise)) {
      view.value = resolveNode(fallback);
    }

    promise.then(
      () => {
        pending.delete(promise);

        if (pending.size === 0) {
          resolved = true;
          view.value = resolveNode(children);
        }
      },
      (error) => {
        pending.delete(promise);
        console.error("Await child promise rejected:", error);
      },
    );
  });

  try {
    children();
  } finally {
    if (!hasPromise) {
      return children();
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
  }
});
