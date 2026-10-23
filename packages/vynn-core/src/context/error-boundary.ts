import { getContext, setContext } from "../life-cycle/owner";

export type ErrorBoundary = (error: Error) => void;

const ERROR_BOUNDARY = Symbol("vynn.error-boundary");

export function getErrorBoundary(): ErrorBoundary | undefined {
  return getContext<ErrorBoundary | undefined>(ERROR_BOUNDARY);
}

export function enterErrorBoundary(boundary: ErrorBoundary | undefined): void {
  setContext(ERROR_BOUNDARY, boundary);
}
