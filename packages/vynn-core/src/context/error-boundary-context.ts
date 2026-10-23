import {
  getContext,
  getOwner,
  modifyContext,
  setContext,
} from "../life-cycle/owner";
import { getRenderMode } from "./render-mode";

export type ErrorBoundary = (error: Error) => void;

const ERROR_BOUNDARY = Symbol("vynn.error-boundary");

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

  owner.context.set("$error-boundary-id", 0);
  owner.context.set("$error-boundary-values", []);
}

export function getErrorBoundaryValues() {
  return getContext<ErrorBoundarySSRState[]>("$error-boundary-values");
}

export function getErrorBoundaryID(): number {
  const id = getContext<number>("$error-boundary-id");

  if (id == null) {
    throw new Error("[vynn]: initializeErrorBoundaryID must be called first");
  }

  modifyContext<number>("$error-boundary-id", (current) => current + 1);

  return id;
}

export function getErrorBoundaryValue(
  errorBoundaryID: number,
): ErrorBoundarySSRState | undefined {
  if (!getRenderMode()) {
    (window as any).__vynnErrorBoundaryData ??= [];
    try {
      return (window as any).__vynnErrorBoundaryData[errorBoundaryID];
    } finally {
      delete (window as any).__vynnErrorBoundaryData[errorBoundaryID];
    }
  }

  return undefined;
}
