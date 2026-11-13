import { ERROR_BOUNDARY_DATA_SSR_KEY } from "../const";
import { getContext, getOwner, modifyContext, setContext } from "../life-cycle/owner";
import type { SSR_ERROR_BOUNDARY } from "../render/resolve-node";
import { isServer } from "./is-server-context";

export type ErrorBoundary = (error: Error) => void;

/**
 * One error-boundary context is shared by CSR and SSR. The handler is the
 * public behavior; the SSR descriptor is private rendering metadata.
 */
export interface ErrorBoundaryContext {
  handler: ErrorBoundary;
  ssrBoundary?: SSR_ERROR_BOUNDARY;
}

const ERROR_BOUNDARY = Symbol("vynn.error-boundary");
const ERROR_BOUNDARY_ID = Symbol("vynn.error-boundary-id");
const ERROR_BOUNDARY_VALUES = Symbol("vynn.error-boundary-values");

export function getErrorBoundaryContext(): ErrorBoundaryContext | undefined {
  return getContext<ErrorBoundaryContext | undefined>(ERROR_BOUNDARY);
}

export function getErrorBoundary(): ErrorBoundary | undefined {
  return getErrorBoundaryContext()?.handler;
}

/**
 * Registers the error handler for the current owner. SSR may attach its
 * internal boundary descriptor to the same context entry.
 */
export function enterErrorBoundary(
  handler: ErrorBoundary | undefined,
  ssrBoundary?: SSR_ERROR_BOUNDARY,
): void {
  setContext(
    ERROR_BOUNDARY,
    handler ? { handler, ssrBoundary } satisfies ErrorBoundaryContext : undefined,
  );
}

/**
 * Temporarily installs an error-boundary context while rendering a subtree.
 * This is internal scope management, not a second registration API.
 */
export function withErrorBoundaryContext<T>(
  context: ErrorBoundaryContext | undefined,
  render: () => T,
): T {
  const owner = getOwner();

  if (!owner) return render();

  const hadPrevious = owner.context.has(ERROR_BOUNDARY);
  const previous = owner.context.get(ERROR_BOUNDARY);

  owner.context.set(ERROR_BOUNDARY, context);

  try {
    return render();
  } finally {
    if (hadPrevious) {
      owner.context.set(ERROR_BOUNDARY, previous);
    } else {
      owner.context.delete(ERROR_BOUNDARY);
    }
  }
}

export type ErrorBoundarySSRState =
  | { status: "children" }
  | {
      status: "fallback";
      name: string;
      message: string;
    };

export function initializeErrorBoundaryContext() {
  const owner = getOwner();

  if (!owner) {
    throw new Error("[vynn]: initializeErrorBoundaryID must be inside owner context");
  }

  setContext(ERROR_BOUNDARY_ID, 0);
  setContext(ERROR_BOUNDARY_VALUES, []);
}

export function getErrorBoundaryValues() {
  return getContext<ErrorBoundarySSRState[]>(ERROR_BOUNDARY_VALUES);
}

export function getErrorBoundaryID(): number {
  const id = getContext<number>(ERROR_BOUNDARY_ID);

  if (id == null) {
    throw new Error("[vynn]: initializeErrorBoundaryContext must be called first");
  }

  modifyContext<number>(ERROR_BOUNDARY_ID, (current) => current + 1);

  return id;
}

export function getErrorBoundaryValue(errorBoundaryID: number): ErrorBoundarySSRState | undefined {
  if (!isServer()) {
    (window as any)[ERROR_BOUNDARY_DATA_SSR_KEY] ??= [];
    try {
      return (window as any)[ERROR_BOUNDARY_DATA_SSR_KEY][errorBoundaryID];
    } finally {
      delete (window as any)[ERROR_BOUNDARY_DATA_SSR_KEY][errorBoundaryID];
    }
  }

  return undefined;
}
