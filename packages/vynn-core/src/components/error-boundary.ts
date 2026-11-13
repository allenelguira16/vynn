import type { JSX } from "../jsx-runtime";
import type { Owner } from "../life-cycle/owner";

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

  if (isServer()) {
    const values = getErrorBoundaryValues();

    if (values) values[errorBoundaryID] = { status: "children" };

    return createSSRErrorBoundary(
      errorBoundaryID,
      (error) =>
        resolveNode(() =>
          props.fallback?.(error, () => undefined),
        ) as unknown as SSR_NODE[],
      () => resolveNode(() => props.children) as unknown as SSR_NODE[],
      (error) => {
        if (values) {
          values[errorBoundaryID] = {
            status: "fallback",
            message: error.message,
            name: error.name,
          };
        }
      },
    ) as unknown as JSX.Element;
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
    viewOwner ??= createOwner();

    return runWithOwner(viewOwner, () => {
      if (!error.value) {
        return props.children;
      }

      return props.fallback?.(error.value!, () => (error.value = undefined));
    });
  });
});
