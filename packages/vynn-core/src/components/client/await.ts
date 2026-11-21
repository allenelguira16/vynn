import type { JSX } from "../../types/jsx";

import { isHydrationClaimActive } from "../../client/hydration";
import { enterAsyncBoundary } from "../../context/async-context";
import { isPromiseFromLazy } from "../../context/lazy-context";
import { getOwner, runWithOwner } from "../../life-cycle/owner";
import { untrack } from "../../reactivity/effect";
import { $state } from "../../reactivity/state";
import { $cmpnt } from "../../render/client/$cmpnt";
import { $if } from "../../render/client/$if";
import { memo } from "../../utils/memo";

/**
 * Displays a fallback while the children are initially loading.
 *
 * By default, the fallback is shown only during the first pending state.
 * Set `suspense` to show it again whenever the children start another async
 * operation.
 */
export const Await = $cmpnt(function Await(props: {
  fallback?: JSX.Element;
  suspense?: boolean;
  children: JSX.Element;
}): JSX.Element {
  const owner = getOwner()!;

  const fallback = memo(() => runWithOwner(owner, () => props.fallback));
  const children = memo(() => runWithOwner(owner, () => props.children));

  return untrack(() => {
    let isResolved = false;
    const isPending = $state(false);
    const pendingPromises = new Set<Promise<unknown>>();

    enterAsyncBoundary((promise) => {
      const shouldShowFallback = !isResolved || props.suspense;
      const isHydratingLazyPromise = isPromiseFromLazy(promise) && isHydrationClaimActive();

      if (!shouldShowFallback || isHydratingLazyPromise) return;

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
