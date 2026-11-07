/**
 * Async function syntax distinguishes an async initializer from an ordinary
 * function value stored in $state.
 */
export function isAsyncFunction(value: unknown): value is () => Promise<unknown> {
  return (
    typeof value === "function" &&
    value.constructor?.name === "AsyncFunction"
  );
}
