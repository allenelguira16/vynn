import { getErrorBoundary } from "../context/error-boundary-context";
import { isServer } from "../context/is-server-context";
import { NotReadyError } from "./not-ready-error";

/**
 * Internal control-flow signal for an error that has already been delivered
 * to the nearest ErrorBoundary. Reactive render effects swallow this signal
 * so the boundary's state update can render its fallback instead.
 */
export class ErrorBoundaryHandledError extends Error {
  constructor(readonly originalError: Error) {
    super(originalError.message);
    this.name = "ErrorBoundaryHandledError";
  }
}

export function isErrorBoundaryHandledError(
  error: unknown,
): error is ErrorBoundaryHandledError {
  return error instanceof ErrorBoundaryHandledError;
}

/**
 * Reports a failure at the point where a reactive value is read.
 *
 * On the server, errors remain ordinary thrown errors and are recovered by
 * the SSR boundary renderer. On the client, the nearest owner-scoped boundary
 * receives the error before the special signal aborts the current render.
 */
export function throwReactiveError(error: unknown): never {
  if (error instanceof NotReadyError || error instanceof ErrorBoundaryHandledError) {
    throw error;
  }

  if (!isServer() && error instanceof Error) {
    const boundary = getErrorBoundary();

    if (boundary) {
      boundary(error);
      throw new ErrorBoundaryHandledError(error);
    }
  }

  throw error;
}
