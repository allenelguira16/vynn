import type { JSX } from "../jsx-runtime";
import {
  getErrorBoundaryID,
  getErrorBoundaryValue,
  getErrorBoundaryValues,
} from "../context/error-boundary-context";
import { isServer } from "../context/is-server-context";
import { createBoundary } from "../life-cycle/boundary";
import { getOwner } from "../life-cycle/owner";
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

    try {
      try {
        return props.children;
      } finally {
        if (values) values[errorBoundaryID] = { status: "children" };
      }
    } catch (error) {
      if (!(error instanceof Error)) throw error;

      if (values)
        values[errorBoundaryID] = {
          status: "fallback",
          message: error.message,
          name: error.name,
        };

      return createSSRErrorBoundary(
        errorBoundaryID,
        () => {
          return resolveNode(() =>
            props.fallback?.(error, () => undefined),
          ) as unknown as SSR_NODE[];
        },
        () => {
          return resolveNode(() => props.children) as unknown as SSR_NODE[];
        },
        error,
      ) as unknown as JSX.Element;
    }
  }

  const error = $state<Error | undefined>(() => undefined);
  const boundary = createBoundary({
    onError: (newError) => {
      error.value = newError;
    },
  });

  if (ssrData?.status === "fallback") {
    error.value = new Error(ssrData.message);
  }

  return $nodes(() =>
    boundary.renderBranch(error.value ? "fallback" : "children", () => {
      if (!error.value) {
        return props.children;
      }

      return props.fallback?.(error.value, () => (error.value = undefined));
    }),
  );
});
