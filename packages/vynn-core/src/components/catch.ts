import type { JSX } from "../jsx-runtime";
import type { Owner } from "../life-cycle/owner";
import type { SSR_ERROR_BOUNDARY, SSR_NODE } from "../render/resolve-node";

import {
  enterErrorBoundary,
  getErrorBoundary,
  getErrorBoundaryID,
  getErrorBoundaryValue,
  getErrorBoundaryValues,
} from "../context/error-boundary";

import {
  createOwner,
  disposeOwner,
  enterOwnerIDTracker,
  getOwner,
  reserveOwnerIDReservations,
  runWithOwner,
} from "../life-cycle/owner";
import { createRuntimeContext, runWithRuntimeContext } from "../runtime/context";
import { $state } from "../reactivity/state";
import { $cmpnt, $nodes } from "../render";
import { createSSRErrorBoundary, resolveNode } from "../render/resolve-node";

export type CatchSSRState =
  | { status: "children" }
  | {
      status: "fallback";
      name: string;
      message: string;
      ownerIDs?: Record<string, number>;
    };

export const Catch = $cmpnt(function Catch(props: {
  fallback?: (error: Error, reset: () => void) => JSX.Element;
  children: JSX.Element;
}) {
  const currentOwner = getOwner();
  const errorBoundaryID = getErrorBoundaryID();
  const ssrData = getErrorBoundaryValue(errorBoundaryID);

  if (!currentOwner) {
    throw new Error("Catch requires an owner.");
  }

  const runtimeContext = createRuntimeContext();

  if (import.meta.env.SSR) {
    const values = getErrorBoundaryValues();
    const parentErrorBoundary = getErrorBoundary();
    const fallbackOwner = props.fallback
      ? createOwner(currentOwner, { identity: false })
      : undefined;
    const ownerIDReservations = new Map<string, number>();
    let capturedOwnerIDs: Record<string, number> | undefined;
    let hasCapturedOwnerIDs = false;
    // oxlint-disable-next-line prefer-const
    let boundary: SSR_ERROR_BOUNDARY;

    const handleError = (error: Error): SSR_ERROR_BOUNDARY => {
      boundary.error = error;

      if (!hasCapturedOwnerIDs) {
        const reservations = Object.fromEntries(ownerIDReservations);
        capturedOwnerIDs = Object.keys(reservations).length ? reservations : undefined;
        hasCapturedOwnerIDs = true;
      }

      if (values) {
        values[errorBoundaryID] = {
          status: "fallback",
          message: error.message,
          name: error.name,
          ...(capturedOwnerIDs ? { ownerIDs: capturedOwnerIDs } : {}),
        };
      }

      return boundary;
    };

    boundary = createSSRErrorBoundary(
      errorBoundaryID,
      () =>
        runWithRuntimeContext(runtimeContext, () => {
          const renderFallback = () =>
            resolveNode(() =>
              props.fallback?.(boundary.error!, () => undefined),
            ) as unknown as SSR_NODE[];

          if (!fallbackOwner) return renderFallback();

          return runWithOwner(fallbackOwner, () => {
            enterErrorBoundary(parentErrorBoundary);
            return renderFallback();
          });
        }),
      () =>
        runWithRuntimeContext(
          runtimeContext,
          () => resolveNode(() => props.children) as unknown as SSR_NODE[],
        ),
      undefined,
      handleError,
    );

    if (values) values[errorBoundaryID] = { status: "children" };

    // Async boundaries created while rendering these children must retain
    // this Catch boundary so failures can be routed back to it after the
    // initial component traversal has completed.
    runWithRuntimeContext(runtimeContext, () => {
      enterOwnerIDTracker(ownerIDReservations);
      enterErrorBoundary(handleError);

      try {
        const children = resolveNode(() => props.children) as unknown as SSR_NODE[];
        boundary.setChildren(children);
      } catch (error) {
        if (!(error instanceof Error)) throw error;
        handleError(error);
      }
    });

    return boundary as unknown as JSX.Element;
  }

  const error = $state<Error | undefined>();

  return runWithRuntimeContext(runtimeContext, () => {
    enterErrorBoundary((newError) => {
      error.value = newError;
    });

  let viewOwner: Owner | undefined;

  if (ssrData?.status === "fallback") {
    reserveOwnerIDReservations(ssrData.ownerIDs);
    error.value = new Error(ssrData.message);
  }

  return $nodes(() => {
    if (viewOwner) {
      disposeOwner(viewOwner);
      viewOwner = undefined;
    }
    // This replaceable view scope exists only on the client and must not
    // consume a hydration ID that the server never allocated.
    viewOwner ??= createOwner(undefined, { identity: false });

    return runWithOwner(viewOwner, () => {
      if (!error.value) {
        return props.children;
      }

      return props.fallback?.(error.value!, () => (error.value = undefined));
    });
  });
  });
});
