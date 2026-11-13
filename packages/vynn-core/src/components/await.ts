import type { JSX } from "../types/jsx";

import { isHydrationClaimActive } from "../client/hydration";
import { enterAsyncBoundary } from "../context/async-context";
import { isServer } from "../context/is-server-context";
import { isPromiseFromLazy } from "../context/lazy-context";
import { getOwner, runWithOwner } from "../life-cycle/owner";
import { $state } from "../reactivity_new/state";
import { untrack } from "../reactivity_new/effect";
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

  return untrack(() => {
    let isResolved = false;
    const isPending = $state(() => false);

    enterAsyncBoundary((promise) => {
      // Ignore lazy imports only while their server-rendered range is being claimed.
      // Lazy imports started by later client-side navigation must show the fallback.
      if (!isResolved && (!isPromiseFromLazy(promise) || !isHydrationClaimActive())) {
        isPending.value = true;
      }

      // Await only tracks whether the children can resume rendering. The
      // async resource retains its rejected state and reports it to the
      // ErrorBoundary when the children render again. Observe both outcomes
      // here so this bookkeeping chain does not create an unhandled rejection.
      const settle = () => {
        isPending.value = false;
      };

      promise.then(settle, settle);
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
