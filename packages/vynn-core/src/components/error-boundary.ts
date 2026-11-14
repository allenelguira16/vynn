import type { JSX } from "../jsx-runtime";
import {
  getErrorBoundary,
  getErrorBoundaryID,
  getErrorBoundaryValue,
  getErrorBoundaryValues,
} from "../context/error-boundary-context";
import { isServer } from "../context/is-server-context";
import { createBoundary } from "../life-cycle/boundary";
import { createComponentOwner, disposeOwner, getOwner, runWithOwner, type Owner } from "../life-cycle/owner";
import { NotReadyError } from "../reactivity_new/not-ready-error";
import { $state } from "../reactivity_new/state";
import { $cmpnt, $nodes } from "../render";
import {
  createSSRErrorBoundary,
  resolveNode,
  resolveSSRChild,
  SSR_NODE,
} from "../render/resolve-node";

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

  if (!currentOwner) {
    throw new Error("ErrorBoundary requires an owner.");
  }

  if (isServer()) {
    const values = getErrorBoundaryValues();
    const parentErrorBoundary = getErrorBoundary();
    if (values) values[errorBoundaryID] = { status: "children" };

    let ssrBoundary: ReturnType<typeof createSSRErrorBoundary> | undefined;
    const boundaryOwner = createBoundary({
      onError(error) {
        ssrBoundary?.handleError(error);
      },
    });
    const childrenOwner = createComponentOwner(boundaryOwner);
    const fallbackOwner = createComponentOwner(currentOwner);
    let children: SSR_NODE[] = [];

    // The SSR node owns the serialized boundary markers. The owner scope only
    // installs error policy; it does not render or switch either branch.
    ssrBoundary = createSSRErrorBoundary(
      errorBoundaryID,
      (error) =>
        runWithOwner(
          fallbackOwner,
          () => resolveNode(() => props.fallback?.(error, () => undefined)) as unknown as SSR_NODE[],
        ),
      () => runWithOwner(childrenOwner, () => children),
      (error) => {
        if (values) {
          values[errorBoundaryID] = {
            status: "fallback",
            message: error.message,
            name: error.name,
          };
        }
      },
      parentErrorBoundary,
    );

    let childError: unknown;

    try {
      children = runWithOwner(
        childrenOwner,
        () => resolveSSRChild(() => props.children) as unknown as SSR_NODE[],
      );
    } catch (error) {
      childError = error;
    }

    if (childError !== undefined) {
      if (!(childError instanceof Error)) throw childError;
      ssrBoundary.handleError(childError);
    }

    return ssrBoundary as unknown as JSX.Element;
  }

  const error = $state<Error | undefined>(() => undefined);
  const handleError = (newError: Error) => {
    error.value = newError;
  };
  const boundaryOwner = createBoundary({ onError: handleError });

  if (ssrData?.status === "fallback") {
    error.value = new Error(ssrData.message);
  }

  // Branch owners are deliberately separate from the boundary scope:
  // children are beneath its error policy; fallback is its sibling.
  // Reserve both branch identities up front so a hydration pass that starts
  // on the fallback does not reuse IDs consumed by a failed server child tree.
  let childrenOwner: Owner | undefined = createComponentOwner(boundaryOwner);
  let fallbackOwner: Owner | undefined = createComponentOwner(currentOwner);

  function disposeChildren(): void {
    if (childrenOwner && !childrenOwner.disposed) {
      disposeOwner(childrenOwner);
    }
    childrenOwner = undefined;
  }

  function disposeFallback(): void {
    if (fallbackOwner && !fallbackOwner.disposed) {
      disposeOwner(fallbackOwner);
    }
    fallbackOwner = undefined;
  }

  function renderChildren(): JSX.Element {
    const owner = (childrenOwner ??= createComponentOwner(boundaryOwner));

    return runWithOwner(owner, () => {
      try {
        return resolveNode(() => props.children) as unknown as JSX.Element;
      } catch (caught) {
        // A synchronous render throw happens inside the outer $nodes effect,
        // whose owner is intentionally outside this boundary scope. Route it
        // here; asynchronous failures are routed by resources/effects through
        // the same owner-scoped handler.
        if (caught instanceof NotReadyError) throw caught;
        if (!(caught instanceof Error)) throw caught;

        handleError(caught);
        return [] as unknown as JSX.Element;
      }
    });
  }

  function renderFallback(currentError: Error): JSX.Element {
    const owner = (fallbackOwner ??= createComponentOwner(currentOwner));

    return runWithOwner(
      owner,
      () =>
        resolveNode(
          () => props.fallback?.(currentError, () => {
            error.value = undefined;
          }),
        ) as unknown as JSX.Element,
    );
  }

  // This output effect is owned by the ErrorBoundary component's parent
  // scope, not its boundary owner. That keeps fallback failures visible to
  // the enclosing ErrorBoundary rather than recapturing them here.
  return $nodes(() => {
    const currentError = error.value;

    if (currentError) {
      disposeChildren();
      return renderFallback(currentError);
    }

    disposeFallback();
    return renderChildren();
  });
});
