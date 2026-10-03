export type UnwrapPromise<T> = T extends PromiseLike<infer U> ? U : T;

export type MaybePromise<T> = T | PromiseLike<T>;

/**
 * Determines whether a value is promise-like.
 *
 * A value is considered promise-like when it is a Promise or an object or
 * function with a callable `then` method.
 *
 * @template T The type resolved by the promise-like value.
 * @param value The value to check.
 * @returns `true` when the value is promise-like.
 */
export function isPromiseLike<T = unknown>(
  value: unknown,
): value is PromiseLike<T> {
  if (value instanceof Promise) {
    return true;
  }

  return (
    ((typeof value === "object" && value !== null) ||
      typeof value === "function") &&
    typeof (value as { then?: unknown }).then === "function"
  );
}
