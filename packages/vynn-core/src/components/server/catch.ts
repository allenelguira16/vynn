import type { JSX } from "../../types/jsx";
import type { SSR_ERROR_BOUNDARY, SSR_NODE } from "../../render/server/resolve-node";

import {
  enterErrorBoundary,
  getErrorBoundary,
  getErrorBoundaryID,
  getErrorBoundaryValues,
} from "../../context/error-boundary-context";
import { getOwner } from "../../life-cycle/owner";
import { $cmpnt } from "../../render/server/$cmpnt";
import { createSSRErrorBoundary, resolveNode } from "../../render/server/resolve-node";

export type CatchSSRState =
  | { status: "children" }
  | {
      status: "fallback";
      name: string;
      message: string;
    };

export const Catch = $cmpnt(function Catch(props: {
  fallback?: (error: Error, reset: () => void) => JSX.Element;
  children: JSX.Element;
}) {
  const currentOwner = getOwner();
  const errorBoundaryID = getErrorBoundaryID();

  if (!currentOwner) {
    throw new Error("Catch requires an owner.");
  }

  const values = getErrorBoundaryValues();
  // oxlint-disable-next-line prefer-const
  let boundary: SSR_ERROR_BOUNDARY;

  const handleError = (error: Error): SSR_ERROR_BOUNDARY => {
    boundary.error = error;

    if (values) {
      values[errorBoundaryID] = {
        status: "fallback",
        message: error.message,
        name: error.name,
      };
    }

    return boundary;
  };

  boundary = createSSRErrorBoundary(
    errorBoundaryID,
    () =>
      resolveNode(() =>
        props.fallback?.(boundary.error!, () => undefined),
      ) as unknown as SSR_NODE[],
    () => resolveNode(() => props.children) as unknown as SSR_NODE[],
    undefined,
    handleError,
  );

  if (values) values[errorBoundaryID] = { status: "children" };

  // Async boundaries created while rendering these children must retain
  // this Catch boundary so failures can be routed back to it after the
  // initial component traversal has completed.
  const parentErrorBoundary = getErrorBoundary();
  enterErrorBoundary(handleError);

  // Resolve children during the component traversal so async resources
  // retain their normal hydration IDs. The owner-scoped tracker also sees
  // resources created later by deferred SSR retries without including
  // allocations made by following siblings.
  try {
    const children = resolveNode(() => props.children) as unknown as SSR_NODE[];
    boundary.setChildren(children);
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    handleError(error);
  } finally {
    enterErrorBoundary(parentErrorBoundary);
  }

  return boundary as unknown as JSX.Element;
});
