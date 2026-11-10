export type ServerFunctionInvocationOptions = {
  /** Cancels the HTTP request and propagates cancellation to the server request signal. */
  signal?: AbortSignal;
};

export type ServerFunctionInvoker = (
  args: unknown[],
  options?: ServerFunctionInvocationOptions,
) => Promise<unknown>;

export const SERVER_FUNCTION_INVOKE = Symbol.for("vynn.server-function.invoke");

/**
 * Invokes a generated server-function reference with per-call transport options.
 *
 * Use this when an async resource provides an AbortSignal. The server can read
 * the same cancellation through getServerFunctionSignal().
 */
export function invokeServerFunction<T extends (...args: never[]) => unknown>(
  reference: T,
  args: Parameters<T>,
  options: ServerFunctionInvocationOptions = {},
): ReturnType<T> {
  const invoker = (
    reference as unknown as {
      [SERVER_FUNCTION_INVOKE]?: ServerFunctionInvoker;
    }
  )[SERVER_FUNCTION_INVOKE];

  if (invoker) {
    return invoker(args as unknown[], options) as ReturnType<T>;
  }

  if (options.signal) {
    throw new TypeError(
      "[Vynn] AbortSignal options require a generated Vynn server-function reference.",
    );
  }

  return reference(...args) as ReturnType<T>;
}
