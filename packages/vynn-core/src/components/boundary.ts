import { getOwnerContext, setOwnerContext } from "../life-cycle/owner";

export type AsyncBoundary = (promise: Promise<void>) => void;

/**
 * Returns the nearest active async rendering boundary.
 *
 * The active boundary is the most recently entered async boundary.
 * Async operations can use it to register promises that should be
 * tracked by the boundary.
 *
 * @returns The nearest active async boundary, or `undefined` when
 * called outside of an async boundary.
 */
export function getAsyncBoundary(): AsyncBoundary | undefined {
  return getOwnerContext<AsyncBoundary>("boundary");
  // return asyncBoundaries.at(-1);
}

/**
 * Enters an async rendering boundary.
 *
 * The boundary becomes active for async operations evaluated within
 * the current rendering scope.
 *
 * @param boundary The async boundary to make active.
 */
export function enterAsyncBoundary(boundary: AsyncBoundary): void {
  return setOwnerContext<AsyncBoundary>("boundary", boundary);
}
