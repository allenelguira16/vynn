import type { JSX } from "../types/jsx";

import { enterAsyncBoundary } from "../context/async-context";
import { isServer } from "../context/is-server-context";
import { isPromiseFromLazy } from "../context/lazy-context";
import { getOwner, runWithOwner } from "../life-cycle/owner";
import { NotReadyError } from "../reactivity/not-ready-error";
import { $state } from "../reactivity/$state";
import { untrack } from "../reactivity/untrack";
import { $cmpnt } from "../render/$cmpnt";
import { $if } from "../render/$if";
import { SSR_NODE, createSSRAsync, resolveNode } from "../render/resolve-node";
import { memo } from "../utils/memo";

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
export const Await = $cmpnt(function Await(props: {
  fallback?: JSX.Element;
  children: JSX.Element;
}): JSX.Element {
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
  if (isServer()) {
    const pending: Promise<any>[] = [];

    enterAsyncBoundary((promise) => {
      pending.push(promise);
    });

    const createBoundary = () =>
      createSSRAsync(
        () => resolveNode(fallback) as unknown as SSR_NODE[],
        () => resolveNode(children) as unknown as SSR_NODE[],
        pending,
      ) as unknown as JSX.Element;

    let renderedChildren: JSX.Element;

    try {
      renderedChildren = children();
    } catch (error) {
      // An async read may throw before the child tree can be returned. Keep
      // Await's streaming behavior for that case, but never swallow redirects
      // or other errors merely because a sibling registered a pending promise.
      if (!(error instanceof NotReadyError) || pending.length === 0) {
        throw error;
      }

      return createBoundary();
    }

    // Keep the first evaluation. Rendering children again here duplicates
    // synchronous side effects and can execute a throwing route guard twice.
    return pending.length === 0 ? renderedChildren : createBoundary();
  }

  return untrack(() => {
    let isResolved = false;
    const isPending = $state(false);

    enterAsyncBoundary((promise) => {
      if (!isResolved && !isPromiseFromLazy(promise)) {
        isPending.value = true;
      }

      promise.then(() => {
        isPending.value = false;
      });
    });

    try {
      return $if(
        () => isPending.value,
        () => fallback(),
        () => children(),
      );
    } finally {
      isResolved = true;
    }
  });
});
