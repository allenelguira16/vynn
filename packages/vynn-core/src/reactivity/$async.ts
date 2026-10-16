import { getAsyncBoundary, NotReadyError } from "../components/boundary";
import { transaction } from "./transaction";
import { $state } from "./$state";
import { $effect } from "./$effect";

export type Async<T> = {
  /**
   * The resolved value of the async operation.
   */
  value: T;
};

const context = new WeakMap<object, { value: unknown }>();

/**
 * Checks whether a derived value is currently pending on a promise.
 *
 * @param value The derived value to check.
 * @returns `true` when the value is backed by a pending promise.
 */
export const isPending = (value: object): boolean => {
  return context.get(value)?.value instanceof Promise;
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
  const result = $state<T | Promise<T>>();

  $effect(() => {
    result.value = getter();
  });

  const derived = {
    get value() {
      return transaction(() => {
        if (result.value instanceof Promise) {
          result.value.then((v) => {
            result.value = v;
          });

          const boundary = getAsyncBoundary();
          boundary?.(result.value);
          throw new NotReadyError(result.value);
        }

        return result.value as T;
      });
    },
    set value(newValue) {
      result.value = newValue as T;
    },
  };

  context.set(derived, result);
  return derived;
}
