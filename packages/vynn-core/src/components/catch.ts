import type { JSX } from "../jsx-runtime";
import type { Owner } from "../life-cycle/owner";
import type { SSR_ERROR_BOUNDARY, SSR_NODE } from "../render/resolve-node";

import {
  enterErrorBoundary,
  getErrorBoundaryID,
  getErrorBoundaryValue,
  getErrorBoundaryValues,
} from "../context/error-boundary-context";
import { isServer } from "../context/is-server-context";
import { createOwner, disposeOwner, getOwner, runWithOwner } from "../life-cycle/owner";
import { $state } from "../reactivity_new/state";
import { $cmpnt, $nodes } from "../render";
import { createSSRErrorBoundary, resolveNode } from "../render/resolve-node";

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
  const ssrData = getErrorBoundaryValue(errorBoundaryID);

  if (!currentOwner) {
    throw new Error("Catch requires an owner.");
  }

  if (isServer()) {
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
    }

    return boundary as unknown as JSX.Element;
  }

  const error = $state<Error | undefined>(() => undefined);

  enterErrorBoundary((newError) => {
    error.value = newError;
  });

  let viewOwner: Owner | undefined;

  if (ssrData?.status === "fallback") {
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
