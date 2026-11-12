import type { JSX } from "../types/jsx";

import { isHydrationClaimActive } from "../client/hydration";
import { enterAsyncBoundary } from "../context/async-context";
import { isServer } from "../context/is-server-context";
import { isPromiseFromLazy } from "../context/lazy-context";
import { getOwner, runWithOwner } from "../life-cycle/owner";
import { $state } from "../reactivity_new/state";
import { NotReadyError } from "../reactivity_new/not-ready-error";
import { untrack } from "../reactivity_new/effect";
import { $cmpnt } from "../render/$cmpnt";
import { $if } from "../render/$if";
import {
  SSR_NODE,
  createSSRAsync,
  createSSRDeferred,
  resolveNode,
  resolveSSRChild,
} from "../render/resolve-node";
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

    const createBoundary = (promises: Promise<any>[]) =>
      createSSRAsync(
        () => resolveNode(fallback) as unknown as SSR_NODE[],
        () => resolveNode(children) as unknown as SSR_NODE[],
        promises,
      ) as unknown as JSX.Element;

    // Resolve lazy modules before retrying the same children. Async resources
    // discovered in the loaded tree can then use the normal streaming boundary.
    const renderAfterLazyResolution = (): SSR_NODE[] =>
      runWithOwner(owner, () => {
        const retryPending: Promise<any>[] = [];
        enterAsyncBoundary((promise) => retryPending.push(promise));

        let retryChildren: JSX.Element;

        try {
          retryChildren = children();
        } catch (error) {
          if (!(error instanceof NotReadyError)) throw error;

          if (retryPending.length === 0) {
            return [createSSRDeferred(renderAfterLazyResolution, [error.promise])];
          }

          return [createPendingBoundary(retryPending) as unknown as SSR_NODE];
        }

        if (retryPending.length > 0) {
          return [createPendingBoundary(retryPending) as unknown as SSR_NODE];
        }

        return resolveSSRChild(() => retryChildren);
      });

    const createPendingBoundary = (promises: Promise<any>[]): JSX.Element => {
      const lazyPromises = promises.filter(isPromiseFromLazy);

      if (lazyPromises.length > 0) {
        // A lazy module can contain components that register additional async
        // resources. Resolve it first, then collect dependencies from the loaded tree.
        return createSSRDeferred(
          renderAfterLazyResolution,
          lazyPromises,
          true,
        ) as unknown as JSX.Element;
      }

      return createBoundary(promises);
    };

    let renderedChildren: JSX.Element;

    try {
      renderedChildren = children();
    } catch (error) {
      // An async read may throw before the child tree can be returned. Keep
      // Await's streaming behavior for that case, but never swallow redirects
      // or other errors merely because a sibling registered a pending promise.
      if (!(error instanceof NotReadyError)) throw error;

      if (pending.length === 0) throw error;

      return createPendingBoundary(pending);
    }

    // Keep the first evaluation. Rendering children again here duplicates
    // synchronous side effects and can execute a throwing route guard twice.
    return pending.length === 0 ? renderedChildren : createPendingBoundary(pending);
  }

  return untrack(() => {
    let isResolved = false;
    const isPending = $state(() => false);

    enterAsyncBoundary((promise) => {
      // Ignore lazy imports only while their server-rendered range is being claimed.
      // Lazy imports started by later client-side navigation must show the fallback.
      if (!isResolved && (!isPromiseFromLazy(promise) || !isHydrationClaimActive())) {
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
