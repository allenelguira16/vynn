import type { JSX } from "../jsx-runtime";
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
    const parentErrorBoundary = getErrorBoundary();

    if (values) values[errorBoundaryID] = { status: "children" };

    const boundary = createSSRErrorBoundary(
      errorBoundaryID,
      (error) =>
        resolveNode(() => props.fallback?.(error, () => undefined)) as unknown as SSR_NODE[],
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
      parentErrorBoundary,
    );

    // Deferred SSR work may settle after this component has returned. Keep
    // the boundary handler on its owner so nested SSR async nodes can report
    // failures to this boundary while the renderer is resolving them.
    enterErrorBoundary((error) => boundary.handleError(error));

    return boundary as unknown as JSX.Element;
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
