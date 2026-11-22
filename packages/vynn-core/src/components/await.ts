import type { JSX } from "../types/jsx";

import { isHydrationClaimActive } from "../client/hydration";
import { bindRuntimeContext, createRuntimeContext, runWithRuntimeContext } from "../runtime/context";
import { enterAsyncBoundary } from "../context/async-boundary";
import { isPromiseFromLazy } from "../runtime/lazy";
import { getOwner, runWithOwner } from "../life-cycle/owner";
import { untrack } from "../reactivity/effect";
import { $state } from "../reactivity/state";
import { $cmpnt } from "../render/$cmpnt";
import { $if } from "../render/$if";
import { SSR_NODE, createSSRAsync, resolveNode } from "../render/resolve-node";
import { memo } from "../utils/memo";

/**
 * Displays a fallback while the children are initially loading.
 *
 * By default, the fallback is shown only during the first pending state.
 * Set `suspense` to show it again whenever the children start another async
 * operation.
 *
 * @param props The fallback content, children, and suspense behavior.
 * @returns The rendered content.
 */
export const Await = $cmpnt(function Await(props: {
  fallback?: JSX.Element;
  suspense?: boolean;
  children: JSX.Element;
}): JSX.Element {
  const owner = getOwner()!;
  const runtimeContext = createRuntimeContext();

  const fallback = memo(() =>
    runWithRuntimeContext(runtimeContext, () => runWithOwner(owner, () => props.fallback)),
  );
  const children = memo(() =>
    runWithRuntimeContext(runtimeContext, () => runWithOwner(owner, () => props.children)),
  );

  if (import.meta.env.SSR) {
    return runWithRuntimeContext(runtimeContext, () => {
      const pending: Promise<any>[] = [];

      enterAsyncBoundary((promise) => {
        pending.push(promise);
      });

      try {
        children();
      } finally {
        if (!pending.length) {
          return resolveNode(children);
        }

        return createSSRAsync(
          () => resolveNode(fallback) as unknown as SSR_NODE[],
          () => resolveNode(children) as unknown as SSR_NODE[],
          pending,
        ) as unknown as JSX.Element;
      }
    });
  }

  return runWithRuntimeContext(runtimeContext, () => untrack(() => {
    let isResolved = false;
    const isPending = $state(false);
    const pendingPromises = new Set<Promise<unknown>>();

    enterAsyncBoundary((promise) => {
      const shouldShowFallback = !isResolved || props.suspense;
      const isHydratingLazyPromise = isPromiseFromLazy(promise) && isHydrationClaimActive();

      if (!shouldShowFallback || isHydratingLazyPromise) return;

      pendingPromises.add(promise);
      isPending.value = true;

      const clearPending = bindRuntimeContext(() => {
        pendingPromises.delete(promise);
        isPending.value = pendingPromises.size > 0;
      });

      void promise.then(clearPending, clearPending);
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
  }));
});
