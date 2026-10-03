import { UnwrapPromise } from "./is-promise-like";
import { createDerived } from "./create-derived";

export type Async<T> = {
  /**
   * The resolved value of the async operation.
   */
  value: UnwrapPromise<T>;
};

/**
 * Handles an async operation and integrates with Suspense.
 *
 * @example
 * const value = $async(async () => {
 *   return doSomething();
 * });
 *
 * value.value;
 *
 * @template T The result type of the async operation.
 * @param getter A function that returns a Promise.
 * @returns A reactive async value containing the resolved result.
 */
export function $async<T>(getter: () => Promise<T>): Async<T> {
  return createDerived(getter, true) as Async<T>;
}
