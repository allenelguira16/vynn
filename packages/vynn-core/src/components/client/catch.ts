import type { JSX } from "../../types/jsx";
import type { Owner } from "../../life-cycle/owner";

import {
  enterErrorBoundary,
  getErrorBoundaryID,
  getErrorBoundaryValue,
} from "../../context/error-boundary-context";
import { createOwner, disposeOwner, getOwner, runWithOwner } from "../../life-cycle/owner";
import { $state } from "../../reactivity/state";
import { $cmpnt } from "../../render/client/$cmpnt";
import { $nodes } from "../../render/client/$nodes";

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

  const error = $state<Error | undefined>();

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
    // This replaceable view scope must not consume a hydration ID that the
    // server never allocated.
    viewOwner ??= createOwner(undefined, { identity: false });

    return runWithOwner(viewOwner, () => {
      if (!error.value) {
        return props.children;
      }

      return props.fallback?.(error.value!, () => (error.value = undefined));
    });
  });
});
