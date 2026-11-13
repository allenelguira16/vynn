import { ERROR_BOUNDARY_DATA_SSR_KEY } from "../const";
import { getContext, getOwner, modifyContext, setContext } from "../life-cycle/owner";
import type { SSR_ERROR_BOUNDARY } from "../render/resolve-node";
import { isServer } from "./is-server-context";

export type ErrorBoundary = (error: Error) => void;
// export type ErrorBoundary = {
//   id: number;
//   handle(error: Error): ErrorBoundary;
//   render(): import("../render/resolve-node").SSR_NODE[];
//   isActive(): boolean;
// };

const ERROR_BOUNDARY = Symbol("vynn.error-boundary");
const SSR_ERROR_BOUNDARY_CONTEXT = Symbol("vynn.ssr-error-boundary");
const ERROR_BOUNDARY_ID = Symbol("vynn.error-boundary-id");
const ERROR_BOUNDARY_VALUES = Symbol("vynn.error-boundary-values");

export function getErrorBoundary(): ErrorBoundary | undefined {
  return getContext<ErrorBoundary | undefined>(ERROR_BOUNDARY);
}

export function enterErrorBoundary(boundary: ErrorBoundary | undefined): void {
  setContext(ERROR_BOUNDARY, boundary);
}

/** Returns the nearest SSR error boundary in the current owner hierarchy. */
export function getSSRErrorBoundary(): SSR_ERROR_BOUNDARY | undefined {
  return getContext<SSR_ERROR_BOUNDARY | undefined>(SSR_ERROR_BOUNDARY_CONTEXT);
}

/** Installs an SSR error boundary on the current component owner. */
export function enterSSRErrorBoundary(boundary: SSR_ERROR_BOUNDARY): void {
  setContext(SSR_ERROR_BOUNDARY_CONTEXT, boundary);
}

/**
 * Temporarily changes the SSR boundary while rendering a boundary's own
 * children or fallback, restoring the previous owner context afterwards.
 */
export function withSSRErrorBoundary<T>(
  boundary: SSR_ERROR_BOUNDARY | undefined,
  render: () => T,
): T {
  const owner = getOwner();

  if (!owner) return render();

  const hadPrevious = owner.context.has(SSR_ERROR_BOUNDARY_CONTEXT);
  const previous = owner.context.get(SSR_ERROR_BOUNDARY_CONTEXT);

  owner.context.set(SSR_ERROR_BOUNDARY_CONTEXT, boundary);

  try {
    return render();
  } finally {
    if (hadPrevious) {
      owner.context.set(SSR_ERROR_BOUNDARY_CONTEXT, previous);
    } else {
      owner.context.delete(SSR_ERROR_BOUNDARY_CONTEXT);
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
