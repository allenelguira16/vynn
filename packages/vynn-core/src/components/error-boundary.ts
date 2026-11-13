import type { JSX } from "../jsx-runtime";
import type { Owner } from "../life-cycle/owner";

import {
  createErrorBoundaryAsyncScopes,
  enterAsyncIDScope,
} from "../context/async-context";
import {
  enterErrorBoundary,
  getErrorBoundary,
  getErrorBoundaryID,
  getErrorBoundaryValue,
  getErrorBoundaryValues,
} from "../context/error-boundary-context";
import { isServer } from "../context/is-server-context";
import { createOwner, disposeOwner, getOwner, runWithOwner } from "../life-cycle/owner";
import { $state } from "../reactivity_new/state";
import { $cmpnt, $nodes } from "../render";
import { createSSRErrorBoundary, resolveNode, SSR_NODE } from "../render/resolve-node";

export type ErrorBoundarySSRState =
  | { status: "children" }
  | {
      status: "fallback";
      name: string;
      message: string;
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

  const error = $state<Error | undefined>(() =>
    ssrData?.status === "fallback" ? new Error(ssrData.message) : undefined,
  );
  const values = getErrorBoundaryValues();
  const parentErrorBoundary = getErrorBoundary();

  // This handler is registered in the same context on both CSR and SSR.
  // SSR additionally records the error for client hydration.
  const handleError = (newError: Error) => {
    error.value = newError;

    if (isServer() && values) {
      values[errorBoundaryID] = {
        status: "fallback",
        message: newError.message,
        name: newError.name,
      };
    }
  };

  if (isServer()) {
    if (values) values[errorBoundaryID] = { status: "children" };

    return createSSRErrorBoundary(
      errorBoundaryID,
      (error) =>
        resolveNode(() =>
          props.fallback?.(error, () => undefined),
        ) as unknown as SSR_NODE[],
      () => resolveNode(() => props.children) as unknown as SSR_NODE[],
      handleError,
    ) as unknown as JSX.Element;
  }

  // A failed SSR child branch is skipped during hydration. Keep its async
  // resource IDs separate from the fallback branch and from sibling boundaries.
  const asyncScopes = createErrorBoundaryAsyncScopes(errorBoundaryID);

  enterErrorBoundary(handleError);

  let viewOwner: Owner | undefined;

  return $nodes(() => {
    if (viewOwner) {
      disposeOwner(viewOwner);
      viewOwner = undefined;
    }
    viewOwner ??= createOwner();

    return runWithOwner(viewOwner, () => {
      if (!error.value) {
        // Reinstall the boundary on the actual owner used to render its child
        // subtree. Async effects created below this point capture this handler.
        enterErrorBoundary(handleError);
        enterAsyncIDScope(asyncScopes.children);
        return props.children;
      }

      // Errors thrown by fallback content belong to the parent boundary, not
      // to the boundary whose fallback is already being rendered.
      enterErrorBoundary(parentErrorBoundary);
      enterAsyncIDScope(asyncScopes.fallback);
      return props.fallback?.(error.value!, () => (error.value = undefined));
    });
  });
});
