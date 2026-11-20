import type { JSX } from "../types/jsx";

import {
  claimHydrationAwaitState,
  isHydrationClaimActive,
} from "../client/hydration";
import { enterAsyncBoundary } from "../context/async-context";
import { isServer } from "../context/is-server-context";
import { isSsrStringRendering, renderSsrAwait } from "../context/ssr-string-context";
import { isPromiseFromLazy } from "../context/lazy-context";
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

  const fallback = memo(() => runWithOwner(owner, () => props.fallback));
  const children = memo(() => runWithOwner(owner, () => props.children));

  if (isSsrStringRendering()) {
    return renderSsrAwait(children, fallback) as JSX.Element;
  }

  if (isServer()) {
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
  }

  const hydrationState = claimHydrationAwaitState();

  return untrack(() => {
    let isResolved = false;
    const isPending = $state(false);
    const pendingPromises = new Set<Promise<unknown>>();

    enterAsyncBoundary((promise) => {
      const isHydrating = isHydrationClaimActive();
      const shouldShowFallback = !isResolved || props.suspense;
      const isHydratingResolvedAwait = hydrationState === "resolved" && isHydrating;
      const isHydratingFallbackAwait = hydrationState === "fallback" && isHydrating;
      const isHydratingLazyPromise = isPromiseFromLazy(promise) && isHydrating;

      // In streamed SSR the server may already have replaced this Await's
      // fallback before the client entry starts. Hydrate the branch the server
      // actually emitted instead of showing a client-only fallback.
      if (
        !shouldShowFallback ||
        isHydratingResolvedAwait ||
        (isHydratingLazyPromise && !isHydratingFallbackAwait)
      ) {
        return;
      }

      pendingPromises.add(promise);
      isPending.value = true;

      const clearPending = () => {
        pendingPromises.delete(promise);
        isPending.value = pendingPromises.size > 0;
      };

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
  });
});
