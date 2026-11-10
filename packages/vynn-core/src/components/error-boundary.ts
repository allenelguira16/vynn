import type { JSX } from "../jsx-runtime";
import type { Owner } from "../life-cycle/owner";

import {
  enterErrorBoundary,
  getErrorBoundary,
  getErrorBoundaryID,
  getErrorBoundaryValue,
  getErrorBoundaryValues,
  type ErrorBoundary as ErrorBoundaryHandle,
} from "../context/error-boundary-context";
import { isServer } from "../context/is-server-context";
import { createOwner, disposeOwner, getOwner, runWithOwner } from "../life-cycle/owner";
import { $state } from "../reactivity/$state";
import { NotReadyError } from "../reactivity/not-ready-error";
import { $cmpnt, $nodes } from "../render";
import { createSSRErrorBoundary, resolveSSRChild } from "../render/resolve-node";

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

  const owner: Owner = currentOwner;

  // Capture the enclosing boundary before registering this one.
  const parentBoundary = getErrorBoundary();

  const view = $state<JSX.Element>();
  let viewOwner: Owner | undefined;
  let failed = false;

  function disposeViewOwner() {
    if (!viewOwner) {
      return;
    }

    const previousOwner = viewOwner;
    viewOwner = undefined;

    disposeOwner(previousOwner);
  }

  function reset() {
    if (!failed) {
      return;
    }

    failed = false;
    renderChildren();
  }

  function renderFallback(error: Error): ErrorBoundaryHandle {
    disposeViewOwner();

    const fallbackOwner = createOwner(owner);
    viewOwner = fallbackOwner;

    let fallbackView: JSX.Element;

    try {
      fallbackView = runWithOwner(fallbackOwner, () => {
        // Errors inside the fallback belong to the enclosing boundary,
        // not the boundary whose fallback is currently being rendered.
        enterErrorBoundary(parentBoundary);

        return props.fallback?.(error, reset);
      });
      if (isServer()) {
        const values = getErrorBoundaryValues();
        if (values) {
          values[errorBoundaryID] = {
            status: "fallback",
            message: error.message,
            name: error.name,
          };
        }
      }
    } catch (fallbackError) {
      if (viewOwner === fallbackOwner) {
        disposeViewOwner();
      }

      if (fallbackError instanceof NotReadyError || !(fallbackError instanceof Error)) {
        throw fallbackError;
      }

      if (parentBoundary) {
        return parentBoundary.handle(fallbackError);
      }

      throw fallbackError;
    }

    view.value = fallbackView;
    return boundary;
  }

  function handleError(error: Error): ErrorBoundaryHandle {
    // Pending async values are handled by Await and SSR deferral.
    if (error instanceof NotReadyError) {
      throw error;
    }

    // An async task may outlive the route or owner that created this boundary.
    // Do not render into a disposed subtree; let the enclosing boundary decide.
    if (owner.disposed) {
      if (parentBoundary) return parentBoundary.handle(error);
      throw error;
    }

    // An error while rendering our own fallback must escape to the
    // enclosing boundary instead of repeatedly rendering this fallback.
    if (failed) {
      disposeViewOwner();

      if (parentBoundary) {
        return parentBoundary.handle(error);
      }

      throw error;
    }

    failed = true;

    // Remove the failed subtree before creating the fallback.
    disposeViewOwner();
    return renderFallback(error);
  }

  function renderChildren(): void {
    disposeViewOwner();

    const nextOwner = createOwner(owner);
    viewOwner = nextOwner;

    let nextView: JSX.Element;

    try {
      nextView = runWithOwner(nextOwner, () => props.children);
      if (isServer()) {
        const values = getErrorBoundaryValues();
        if (values) values[errorBoundaryID] = { status: "children" };
      }
    } catch (error) {
      if (viewOwner === nextOwner) {
        disposeViewOwner();
      }

      // Do not turn async suspension or arbitrary thrown values into
      // ordinary application errors.
      if (error instanceof NotReadyError || !(error instanceof Error)) {
        throw error;
      }

      handleError(error);
      return;
    }

    // An inner render effect may already have handled an error,
    // disposed this child owner, and rendered the fallback.
    if (!failed && viewOwner === nextOwner) {
      view.value = nextView;
    }
  }

  const boundary: ErrorBoundaryHandle = {
    id: errorBoundaryID,
    handle: (error) => runWithOwner(owner, () => handleError(error)),
    render: () => runWithOwner(viewOwner ?? owner, () => resolveSSRChild(() => view.value)),
    isActive: () => !owner.disposed,
  };

  enterErrorBoundary(boundary);

  // console.log();
  if (ssrData?.status === "fallback") {
    renderFallback(new Error(ssrData.message));
  } else {
    renderChildren();
  }

  // Keep the boundary's own reactive output alive when its child owner
  // is replaced by a fallback or recreated by reset().
  return isServer()
    ? (createSSRErrorBoundary(errorBoundaryID, boundary.render, boundary) as unknown as JSX.Element)
    : $nodes(() => view.value);
});
