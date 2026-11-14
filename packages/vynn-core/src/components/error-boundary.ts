import type { JSX } from "../jsx-runtime";
import { getAsyncIDSnapshot, restoreAsyncIDSnapshot } from "../context/async-context";
import {
  enterErrorBoundary,
  getErrorBoundary,
  getErrorBoundaryID,
  getErrorBoundaryValue,
  getErrorBoundaryValues,
} from "../context/error-boundary-context";
import { isServer } from "../context/is-server-context";
import { createBoundary } from "../life-cycle/boundary";
import { getOwner } from "../life-cycle/owner";
import { $state } from "../reactivity_new/state";
import { $cmpnt, $nodes } from "../render";
import { createSSRErrorBoundary, resolveNode, resolveSSRChild, SSR_NODE } from "../render/resolve-node";

export type ErrorBoundarySSRState =
  | { status: "children" }
  | {
      status: "fallback";
      name: string;
      message: string;
      asyncIDSnapshot?: ReturnType<typeof getAsyncIDSnapshot>;
    };

export const ErrorBoundary = $cmpnt(function ErrorBoundary(props: {
  fallback?: (error: Error, reset: () => void) => JSX.Element;
  children: JSX.Element;
}) {
  const currentOwner = getOwner();
  const errorBoundaryID = getErrorBoundaryID();
  const ssrData = getErrorBoundaryValue(errorBoundaryID);
  // console.log(ssrData);

  if (!currentOwner) {
    throw new Error("ErrorBoundary requires an owner.");
  }

  if (isServer()) {
    const values = getErrorBoundaryValues();
    const parentErrorBoundary = getErrorBoundary();

    if (values) values[errorBoundaryID] = { status: "children" };

    // Create the boundary before evaluating children so resources created
    // during that evaluation capture this boundary as their error handler.
    // Resolve the child tree now, not later in the SSR renderer: async resource
    // IDs must be allocated in the same tree order as they are during hydration.
    const asyncIDStart = getAsyncIDSnapshot();
    let asyncIDEnd = asyncIDStart;
    let children: SSR_NODE[] = [];

    const boundary = createSSRErrorBoundary(
      errorBoundaryID,
      (error) =>
        resolveNode(() => props.fallback?.(error, () => undefined)) as unknown as SSR_NODE[],
      () => children,
      (error) => {
        if (values) {
          values[errorBoundaryID] = {
            status: "fallback",
            message: error.message,
            name: error.name,
            asyncIDSnapshot: asyncIDEnd,
          };
        }
      },
      parentErrorBoundary,
    );

    // Install the handler before resolving children. resolveSSRChild preserves
    // a pending subtree as SSR_DEFERRED without delaying resource creation.
    enterErrorBoundary((error) => boundary.handleError(error));

    let childError: unknown;

    try {
      children = resolveSSRChild(() => props.children) as unknown as SSR_NODE[];
    } catch (error) {
      childError = error;
    } finally {
      asyncIDEnd = getAsyncIDSnapshot();
    }

    if (childError !== undefined) {
      if (!(childError instanceof Error)) throw childError;
      boundary.handleError(childError);
    }

    return boundary as unknown as JSX.Element;
  }

  const error = $state<Error | undefined>(() => undefined);
  const boundary = createBoundary({
    onError: (newError) => {
      error.value = newError;
    },
  });

  if (ssrData?.status === "fallback") {
    // The browser skips the failed child subtree, but the server may already
    // have assigned async hydration IDs to resources created inside it.
    // Reserve those IDs so following siblings read their own serialized data.
    restoreAsyncIDSnapshot(ssrData.asyncIDSnapshot);
    error.value = new Error(ssrData.message);
  }

  return $nodes(() =>
    boundary.renderBranch(error.value ? "fallback" : "children", () =>
      resolveNode(() => {
        if (!error.value) {
          return props.children;
        }

        return props.fallback?.(error.value, () => (error.value = undefined));
      }) as unknown as JSX.Element,
    ),
  );
});
