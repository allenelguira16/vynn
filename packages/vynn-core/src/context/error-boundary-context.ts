import {
  getContext,
  getOwner,
  modifyContext,
  setContext,
} from "../life-cycle/owner";
import { isServer } from "./is-server-context";

export type ErrorBoundary = (error: Error) => void;

const ERROR_BOUNDARY = Symbol("vynn.error-boundary");
const ERROR_BOUNDARY_ID = Symbol("vynn.error-boundary-id");
const ERROR_BOUNDARY_VALUES = Symbol("vynn.error-boundary-values");

export function getErrorBoundary(): ErrorBoundary | undefined {
  return getContext<ErrorBoundary | undefined>(ERROR_BOUNDARY);
}

export function enterErrorBoundary(boundary: ErrorBoundary | undefined): void {
  setContext(ERROR_BOUNDARY, boundary);
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
    throw new Error(
      "[vynn]: initializeErrorBoundaryID must be inside owner context",
    );
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
    throw new Error(
      "[vynn]: initializeErrorBoundaryContext must be called first",
    );
  }

  modifyContext<number>(ERROR_BOUNDARY_ID, (current) => current + 1);

  return id;
}

export function getErrorBoundaryValue(
  errorBoundaryID: number,
): ErrorBoundarySSRState | undefined {
  if (!isServer()) {
    (window as any).__vynnErrorBoundaryData ??= [];
    try {
      return (window as any).__vynnErrorBoundaryData[errorBoundaryID];
    } finally {
      delete (window as any).__vynnErrorBoundaryData[errorBoundaryID];
    }
  }

  return undefined;
}
