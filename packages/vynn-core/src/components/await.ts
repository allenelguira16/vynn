import type { JSX } from "../types/jsx";

import { isHydrationClaimActive } from "../client/hydration";
import { getErrorBoundary } from "../context/error-boundary-context";
import { createBoundary } from "../life-cycle/boundary";
import { isServer } from "../context/is-server-context";
import { isPromiseFromLazy } from "../context/lazy-context";
import { createComponentOwner, getOwner, runWithOwner } from "../life-cycle/owner";
import { NotReadyError } from "../reactivity_new/not-ready-error";
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
  const fallback = memo(() => props.fallback);
  const children = memo(() => props.children);
  const parentOwner = getOwner();

  if (isServer()) {
    const pending: Promise<unknown>[] = [];
    const boundaryOwner = createBoundary({
      onPending(promise) {
        pending.push(promise);
      },
    });
    // Allocate both branch identities before rendering either branch. A server
    // pass that falls back and a client hydration pass that skips the children
    // must still assign the fallback subtree the same component identity.
    const childrenOwner = createComponentOwner(boundaryOwner);
    const fallbackOwner = createComponentOwner(parentOwner);

    return runWithOwner(childrenOwner, () => {
      try {
        // Preserve the initial child evaluation in the boundary's scope. It
        // may register pending work before resolveNode materializes the tree.
        children();
      } catch (error) {
        if (!(error instanceof NotReadyError)) throw error;
      }

      if (!pending.length) {
        return resolveNode(children) as unknown as JSX.Element;
      }

      return createSSRAsync(
        () =>
          runWithOwner(
            fallbackOwner,
            () => resolveNode(fallback) as unknown as SSR_NODE[],
          ),
        () =>
          runWithOwner(
            childrenOwner,
            () => resolveNode(children) as unknown as SSR_NODE[],
          ),
        pending,
      ) as unknown as JSX.Element;
    });
  }

  return untrack(() => {
    let isResolved = false;
    const isPending = $state(() => false);
    const errorBoundary = getErrorBoundary();
    const boundaryOwner = createBoundary({
      onPending(promise) {
        // Ignore lazy imports only while their server-rendered range is being claimed.
        // Lazy imports started by later client-side navigation must show the fallback.
        if (!isResolved && (!isPromiseFromLazy(promise) || !isHydrationClaimActive())) {
          isPending.value = true;
        }

        const settle = () => {
          isPending.value = false;
        };

        // Observe both outcomes. A rejected child resource remains rejected and
        // is surfaced when the children render again; this handler only settles
        // Await's pending bookkeeping.
        void promise.then(settle, settle).catch((error: unknown) => {
          if (error instanceof Error && errorBoundary) {
            errorBoundary(error);
            return;
          }

          queueMicrotask(() => {
            throw error;
          });
        });
      },
    });

    // Await owns two independent scopes: children inherit its pending policy,
    // while fallback content is a sibling and cannot suspend this same Await.
    // Keep both branch identities stable across SSR and hydration, even
    // when the initial client pass starts directly in the fallback branch.
    const childrenOwner = createComponentOwner(boundaryOwner);
    const fallbackOwner = createComponentOwner(parentOwner);

    const renderFallback = () =>
      runWithOwner(
        fallbackOwner,
        () => resolveNode(fallback) as unknown as JSX.Element,
      );
    const renderChildren = () =>
      runWithOwner(childrenOwner, () => resolveNode(children) as unknown as JSX.Element);

    try {
      return runWithOwner(parentOwner, () =>
        $if(() => isPending.value, renderFallback, renderChildren),
      );
    } finally {
      isResolved = true;
    }
  });
});
