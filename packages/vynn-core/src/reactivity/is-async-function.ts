/**
 * Recognizes async-function syntax used by $state to distinguish an async
 * initializer from a synchronous function value stored as state.
 *
 * Promise-returning callbacks are supported by $computed and $store, whose
 * arguments are unambiguously getters/initializers. $state intentionally
 * preserves ordinary function values, so its async initializer uses the
 * explicit async-function form.
 */
export function isAsyncFunction(value: unknown): value is () => Promise<unknown> {
  return (
    typeof value === "function" &&
    Object.prototype.toString.call(value) === "[object AsyncFunction]"
  );
}
