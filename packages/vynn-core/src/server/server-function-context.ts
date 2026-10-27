import { AsyncLocalStorage } from "node:async_hooks";

export type ServerFunctionContext = {
  /** The HTTP request that invoked this server function. */
  readonly request: Request;
  /** Stable ID assigned to the server function by the Vynn compiler. */
  readonly functionId: string;
};

const serverFunctionContext = new AsyncLocalStorage<ServerFunctionContext>();

/** Runs a server function with request-local context that survives await. */
export function runWithServerFunctionContext<T>(context: ServerFunctionContext, callback: () => T): T {
  return serverFunctionContext.run(context, callback);
}

/** Get the context for the currently executing server function. */
export function getServerFunctionContext(): ServerFunctionContext {
  const context = serverFunctionContext.getStore();
  if (!context) throw new Error("[Vynn] No server-function request context is active. This API can only be used while a server function is running.");
  return context;
}

/** Get the request that invoked the currently executing server function. */
export function getServerFunctionRequest(): Request { return getServerFunctionContext().request; }
