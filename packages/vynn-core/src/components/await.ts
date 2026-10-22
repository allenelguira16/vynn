import type { JSX } from "../types/jsx";
import { $cmpnt } from "../render/$cmpnt";
import { createSSRAsync, resolveNode, SSR_NODE } from "../render/resolve-node";
import { enterAsyncBoundary } from "./boundary";
import { $state } from "../reactivity/$state";
import { $renderEffect } from "../reactivity/$effect";
import { getRenderMode } from "../context/render-mode";
import { NotReadyError } from "../reactivity/not-ready-error";
import { $memo } from "../render";
import { isHydrating, runAfterHydration } from "../render/hydration";
import { isInsideLazy } from "./lazy";

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
    try {
      return props.children;
    } catch (error) {
      if (!(error instanceof NotReadyError)) {
        throw error;
      }

      return props.fallback;
    }
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
  if (mode === "stream") {
    const pending: Promise<unknown>[] = [];

    enterAsyncBoundary((promise) => {
      if (!pending.includes(promise)) {
        pending.push(promise);
      }
    });

    const fallback = () =>
      resolveNode(() => props.fallback) as unknown as SSR_NODE[];

    try {
      // Evaluate the children once.
      const children = props.children;

      // No async work was registered, so return normally.
      if (pending.length === 0) {
        return children;
      }

      // Preserve the SSR nodes and their component-owned state.
      const cachedChildren = resolveNode(
        () => children,
      ) as unknown as SSR_NODE[];

      return createSSRAsync(fallback, () => cachedChildren, [
        ...pending,
      ]) as unknown as JSX.Element;
    } catch (error) {
      if (!(error instanceof NotReadyError)) {
        throw error;
      }

      if (!pending.includes(error.promise)) {
        pending.push(error.promise);
      }

      // Retain the existing retry behavior for expressions that
      // suspend before producing a complete child tree.
      return createSSRAsync(
        fallback,
        () => resolveNode(() => props.children) as unknown as SSR_NODE[],
        [...pending],
      ) as unknown as JSX.Element;
    }
  }

  let resolved = false;
  let hasPromise = false;

  const markerEnd = document.createTextNode("");
  const view = $state<Node[]>([]);

  let nodes: Node[] = [];
  const pending = new Set<Promise<unknown>>();

  const fallback = $memo(() => props.fallback);
  const children = $memo(() => props.children);

  enterAsyncBoundary((promise) => {
    hasPromise = true;

    if (pending.has(promise)) {
      return;
    }

    pending.add(promise);

    // console.log(resolved, isHydrating());
    // console.log();
    if (!resolved && !("__lazy" in promise)) {
      // console.log("running???");
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

  // runAfterHydration(() => {
  children();
  // });

  // Keep the reactive view active even when the async work
  // is discovered later by a nested effect.
  if (!hasPromise) {
    return resolveNode(children);
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
