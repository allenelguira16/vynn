import { getOwnerContext, setOwnerContext } from "../life-cycle/owner";

export type AsyncBoundary<T = any> = (promise: Promise<T>) => void;

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
export function getAsyncBoundary<T = any>(): AsyncBoundary<T> | undefined {
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
export function enterAsyncBoundary<T>(boundary: AsyncBoundary<T>): void {
  return setOwnerContext<AsyncBoundary<T>>("boundary", boundary);
}

export class NotReadyError extends Error {
  constructor(public readonly source: unknown) {
    super();
    this.name = "NotReadyError";
  }
}

export class NeedsParentError extends Error {
  constructor() {
    super();
    this.name = "NeedsParentError";
  }
}

export type RenderParent = ParentNode;

export type RenderBoundary = {
  parent: RenderParent;
};

let currentBoundary: RenderBoundary | null = null;

export function getRenderBoundary(): RenderBoundary | null {
  return currentBoundary;
}

export function withRenderBoundary<T>(
  parent: RenderParent,
  callback: () => T,
): T {
  const previous = currentBoundary;

  currentBoundary = { parent };

  try {
    return callback();
  } finally {
    currentBoundary = previous;
  }
}
