import {
  enterErrorBoundary,
  getErrorBoundary,
} from "../context/error-boundary";
import type { JSX } from "../jsx-runtime";
import {
  createOwner,
  disposeOwner,
  getOwner,
  runWithOwner,
} from "../life-cycle/owner";
import type { Owner } from "../life-cycle/owner";
import { $state } from "../reactivity/$state";
import { NotReadyError } from "../reactivity/not-ready-error";
import { $cmpnt, $nodes } from "../render";

export const ErrorBoundary = $cmpnt(function ErrorBoundary(props: {
  fallback?: (error: Error, reset: () => void) => JSX.Element;
  children: JSX.Element;
}) {
  const owner = getOwner();

  if (!owner) {
    throw new Error("ErrorBoundary requires an owner.");
  }

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

  function renderFallback(error: Error) {
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
    } catch (fallbackError) {
      if (viewOwner === fallbackOwner) {
        disposeViewOwner();
      }

      if (
        fallbackError instanceof NotReadyError ||
        !(fallbackError instanceof Error)
      ) {
        throw fallbackError;
      }

      if (parentBoundary) {
        parentBoundary(fallbackError);
        return;
      }

      throw fallbackError;
    }

    view.value = fallbackView;
  }

  function handleError(error: Error): void {
    // Pending async values are handled by Await and SSR deferral.
    if (error instanceof NotReadyError) {
      throw error;
    }

    // An error while rendering our own fallback must escape to the
    // enclosing boundary instead of repeatedly rendering this fallback.
    if (failed) {
      disposeViewOwner();

      if (parentBoundary) {
        parentBoundary(error);
        return;
      }

      throw error;
    }

    failed = true;

    // Remove the failed subtree before creating the fallback.
    disposeViewOwner();
    renderFallback(error);
  }

  function renderChildren(): void {
    disposeViewOwner();

    const nextOwner = createOwner(owner);
    viewOwner = nextOwner;

    let nextView: JSX.Element;

    try {
      nextView = runWithOwner(nextOwner, () => props.children);
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

    view.value = nextView;
  }

  enterErrorBoundary(handleError);

  renderChildren();

  // Keep the boundary's own reactive output alive when its child owner
  // is replaced by a fallback or recreated by reset().
  return $nodes(() => view.value);
});
