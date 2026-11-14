import { enterAsyncBoundary } from "../context/async-context";
import { enterErrorBoundary } from "../context/error-boundary-context";
import { createOwner, runWithOwner, type Owner, type OwnerBoundaryHandlers } from "./owner";

/** Policies inherited by resources and effects created under a boundary scope. */
export type BoundaryOptions = OwnerBoundaryHandlers;

/**
 * Creates an owner scope for boundary-managed work.
 *
 * Descendants discover the nearest error and pending handlers through owner
 * ancestry. Rendering and branch lifetime deliberately remain the
 * responsibility of the boundary component using this scope.
 */
export function createBoundary(options: BoundaryOptions = {}): Owner {
  const owner = createOwner();

  runWithOwner(owner, () => {
    if (options.onError) enterErrorBoundary(options.onError);
    if (options.onPending) enterAsyncBoundary(options.onPending);
  });

  return owner;
}
