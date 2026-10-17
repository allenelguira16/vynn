import type { JSX } from "../types/jsx";
import { $cmpnt } from "../render/$cmpnt";
import { createSSRAsync, resolveNode, SSR_NODE } from "../render/resolve-node";
import { enterAsyncBoundary, NotReadyError } from "./boundary";
import { $state } from "../reactivity/$state";
import { $effect } from "../reactivity/$effect";
import { getRenderMode } from "../context/render-mode";

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
      const fallback = props.fallback;
      const children = props.children;

      // return children;
      // console.log(pending);
      return children;
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

    // try {
    //   const fallback = props.fallback;
    //   const children = props.children;
    //   // props.children;
    //   // console.log(pending);

    //   if (!pending.length) {
    //     return props.children;
    //   }

    //   // console.log(pending);

    //   // console.log(children);
    //   return createSSRAsync(
    //     () => resolveNode(() => fallback) as unknown as SSR_NODE[],
    //     () => resolveNode(() => children) as unknown as SSR_NODE[],
    //     pending,
    //   ) as unknown as JSX.Element;
    // } catch (error) {
    //   if (error instanceof NotReadyError) {
    //     // error.promise.then(() => {
    //     //   console.log(props.children);
    //     // });
    //     return createSSRAsync(
    //       () => resolveNode(() => props.fallback) as unknown as SSR_NODE[],
    //       () => resolveNode(() => props.children) as unknown as SSR_NODE[],
    //       [...pending, error.promise],
    //     ) as unknown as JSX.Element;
    //   }
    // }

    // return;
  }

  let resolved = false;
  // const markerStart = document.createComment("");
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

  return [nodes, markerEnd];
});
