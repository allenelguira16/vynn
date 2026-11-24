import { ERROR_BOUNDARY_DATA_SSR_KEY } from "../const";
import { getOwner } from "../life-cycle/owner";
import {
  getOwnerContext,
  modifyOwnerContext,
  setOwnerContext,
  setRootOwnerContext,
} from "./owner-context";

export type ErrorBoundary = (error: Error) => void;

const ERROR_BOUNDARY = Symbol("vynn.error-boundary");
const ERROR_BOUNDARY_ID = Symbol("vynn.error-boundary-id");
const ERROR_BOUNDARY_VALUES = Symbol("vynn.error-boundary-values");

export function getErrorBoundary(): ErrorBoundary | undefined {
  return getOwnerContext<ErrorBoundary | undefined>(ERROR_BOUNDARY);
}

export function enterErrorBoundary(boundary: ErrorBoundary | undefined): void {
  setOwnerContext(ERROR_BOUNDARY, boundary);
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

  setRootOwnerContext(ERROR_BOUNDARY_ID, 0);
  setRootOwnerContext(ERROR_BOUNDARY_VALUES, []);
}

export function getErrorBoundaryValues() {
  return getOwnerContext<ErrorBoundarySSRState[]>(ERROR_BOUNDARY_VALUES);
}

export function getErrorBoundaryID(): number {
  let id = getOwnerContext<number>(ERROR_BOUNDARY_ID);

  // Keep the boundary counter out of the startup path when no Catch is used.
  if (id == null) {
    initializeErrorBoundaryContext();
    id = getOwnerContext<number>(ERROR_BOUNDARY_ID);
  }

  if (id == null) {
    throw new Error("[vynn]: Catch requires an active owner.");
  }

  modifyOwnerContext<number>(ERROR_BOUNDARY_ID, (current) => current + 1);

  return id;
}

export function getErrorBoundaryValue(errorBoundaryID: number): ErrorBoundarySSRState | undefined {
  if (!import.meta.env.SSR) {
    (window as any)[ERROR_BOUNDARY_DATA_SSR_KEY] ??= [];
    try {
      return (window as any)[ERROR_BOUNDARY_DATA_SSR_KEY][errorBoundaryID];
    } finally {
      delete (window as any)[ERROR_BOUNDARY_DATA_SSR_KEY][errorBoundaryID];
    }
  }

  return undefined;
}
