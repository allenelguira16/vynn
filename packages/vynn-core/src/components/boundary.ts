import {
  getCurrentOwner,
  getOwnerContext,
  setOwnerContext,
} from "../life-cycle/owner";

export type AsyncBoundary<T = unknown> = (promise: Promise<T>) => void;

const ASYNC_BOUNDARY = Symbol("vynn.async-boundary");

export function getAsyncBoundary<T = unknown>(): AsyncBoundary<T> | undefined {
  return getOwnerContext<AsyncBoundary<T>>(ASYNC_BOUNDARY);
}

/**
 * Permanently sets the boundary on the current owner.
 * Use for a component-level boundary such as client-side Await.
 */
export function enterAsyncBoundary<T>(boundary: AsyncBoundary<T>): void {
  setOwnerContext(ASYNC_BOUNDARY, boundary);
}

/**
 * Temporarily overrides the boundary during synchronous evaluation.
 * Always restores the previous boundary, even if evaluation throws.
 */
export function withAsyncBoundary<T, R>(
  boundary: AsyncBoundary<T>,
  callback: () => R,
): R {
  const owner = getCurrentOwner();

  if (!owner) {
    return callback();
  }

  const hadPrevious = owner.context.has(ASYNC_BOUNDARY);
  const previous = owner.context.get(ASYNC_BOUNDARY);

  owner.context.set(ASYNC_BOUNDARY, boundary);

  try {
    return callback();
  } finally {
    if (hadPrevious) {
      owner.context.set(ASYNC_BOUNDARY, previous);
    } else {
      owner.context.delete(ASYNC_BOUNDARY);
    }
  }
}

// export class NeedsParentError extends Error {
//   constructor() {
//     super();
//     this.name = "NeedsParentError";
//   }
// }

// export type RenderParent = ParentNode;

// export type RenderBoundary = {
//   parent: RenderParent;
// };

// let currentBoundary: RenderBoundary | null = null;

// export function getRenderBoundary(): RenderBoundary | null {
//   return currentBoundary;
// }

// export function withRenderBoundary<T>(
//   parent: RenderParent,
//   callback: () => T,
// ): T {
//   const previous = currentBoundary;

//   currentBoundary = { parent };

//   try {
//     return callback();
//   } finally {
//     currentBoundary = previous;
//   }
// }
