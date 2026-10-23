import { getContext, setContext } from "../life-cycle/owner";

export type AsyncBoundary<T = unknown> = (promise: Promise<T>) => void;

const ASYNC_BOUNDARY = Symbol("vynn.async-boundary");
const AWAIT_BOUNDARY = Symbol("vynn.await-boundary");

export function isInsideAwaitBoundary(): boolean {
  return getContext<boolean>(AWAIT_BOUNDARY) ?? false;
}

export function getAsyncBoundary<T = unknown>(): AsyncBoundary<T> | undefined {
  return getContext<AsyncBoundary<T>>(ASYNC_BOUNDARY);
}

/**
 * Permanently sets the boundary on the current owner.
 * Use for a component-level boundary such as client-side Await.
 */
export function enterAsyncBoundary<T>(boundary: AsyncBoundary<T>): void {
  setContext(ASYNC_BOUNDARY, boundary);
  setContext(AWAIT_BOUNDARY, true);
}

// /**
//  * Temporarily overrides the boundary during synchronous evaluation.
//  * Always restores the previous boundary, even if evaluation throws.
//  */
// export function withAsyncBoundary<T, R>(
//   boundary: AsyncBoundary<T>,
//   callback: () => R,
// ): R {
//   const owner = getCurrentOwner();

//   if (!owner) {
//     return callback();
//   }

//   const hadPrevious = owner.context.has(ASYNC_BOUNDARY);
//   const previous = owner.context.get(ASYNC_BOUNDARY);

//   owner.context.set(ASYNC_BOUNDARY, boundary);

//   try {
//     return callback();
//   } finally {
//     if (hadPrevious) {
//       owner.context.set(ASYNC_BOUNDARY, previous);
//     } else {
//       owner.context.delete(ASYNC_BOUNDARY);
//     }
//   }
// }
