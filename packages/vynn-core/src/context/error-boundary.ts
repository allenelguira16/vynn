import { getContext, setContext } from "../life-cycle/owner";

export type ErrorBoundary = (error: Error) => void;

const ERROR_BOUNDARY = Symbol("vynn.error-boundary");

export function getErrorBoundary(): ErrorBoundary | undefined {
  return getContext<ErrorBoundary>(ERROR_BOUNDARY);
}

export function enterErrorBoundary(boundary: ErrorBoundary): void {
  setContext(ERROR_BOUNDARY, boundary);
}
