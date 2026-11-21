import type { JSX } from "../../types/jsx";

import { enterAsyncBoundary } from "../../context/async-context";
import { getOwner, runWithOwner } from "../../life-cycle/owner";
import { $cmpnt } from "../../render/server/$cmpnt";
import { SSR_NODE, createSSRAsync, resolveNode } from "../../render/server/resolve-node";
import { memo } from "../../utils/memo";

/**
 * Displays a fallback while the children are initially loading.
 *
 * On the server, pending child work is represented by an SSR async boundary.
 */
export const Await = $cmpnt(function Await(props: {
  fallback?: JSX.Element;
  suspense?: boolean;
  children: JSX.Element;
}): JSX.Element {
  const owner = getOwner()!;

  const fallback = memo(() => runWithOwner(owner, () => props.fallback));
  const children = memo(() => runWithOwner(owner, () => props.children));
  const pending: Promise<unknown>[] = [];

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
