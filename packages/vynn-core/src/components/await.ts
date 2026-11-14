import type { JSX } from "../types/jsx";

import { isHydrationClaimActive } from "../client/hydration";
import { getErrorBoundary } from "../context/error-boundary-context";
import { createBoundary } from "../life-cycle/boundary";
import { isServer } from "../context/is-server-context";
import { isPromiseFromLazy } from "../context/lazy-context";
import { runWithOwner } from "../life-cycle/owner";
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
  const boundary = createBoundary({ retainBranches: true });

  if (isServer()) {
    const pending: Promise<any>[] = [];

    boundary.setPendingHandler((promise) => {
      pending.push(promise);
    });

    return runWithOwner(boundary.owner, () => {
      try {
        boundary.renderBranch("children", () => children());
      } finally {
        if (!pending.length) {
          return boundary.renderBranch("children", () => resolveNode(children));
        }

        return createSSRAsync(
          () =>
            boundary.renderBranch(
              "fallback",
              () => resolveNode(fallback) as unknown as SSR_NODE[],
            ),
          () =>
            boundary.renderBranch(
              "children",
              () => resolveNode(children) as unknown as SSR_NODE[],
            ),
          pending,
        ) as unknown as JSX.Element;
      }
    });
  }

  return untrack(() => {
    let isResolved = false;
    const isPending = $state(() => false);
    const errorBoundary = getErrorBoundary();

    boundary.setPendingHandler((promise) => {
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
    });

    try {
      return runWithOwner(boundary.owner, () =>
        $if(
          () => isPending.value,
          () => fallback(),
          () => children(),
          (active, render) =>
            boundary.renderBranch(active ? "fallback" : "children", render),
        ),
      );
    } finally {
      isResolved = true;
    }
  });
});
