import {
  getContext,
  getOwner,
  modifyContext,
  setContext,
} from "../life-cycle/owner";
import { getRenderMode } from "./render-mode";

export type AsyncBoundary<T = unknown> = (promise: Promise<T>) => void;

const ASYNC_BOUNDARY = Symbol("vynn.async-boundary");
const AWAIT_BOUNDARY = Symbol("vynn.await-boundary");

export function isInsideAwaitBoundary(): boolean {
  return getContext<boolean>(AWAIT_BOUNDARY) ?? false;
}

export function getAsyncBoundary<T = unknown>(): AsyncBoundary<T> | undefined {
  return getContext<AsyncBoundary<T>>(ASYNC_BOUNDARY);
}

/**
 * Permanently sets the boundary on the current owner.
 * Use for a component-level boundary such as client-side Await.
 */
export function enterAsyncBoundary<T>(boundary: AsyncBoundary<T>): void {
  setContext(ASYNC_BOUNDARY, boundary);
  setContext(AWAIT_BOUNDARY, true);
}

export function initializeAsyncContext() {
  const owner = getOwner();

  if (!owner)
    throw new Error("[vynn]: initializeAsyncID must be inside owner context");

  owner.context.set("$async-id", 0);
  owner.context.set("$async-values", []);
}

export function getAsyncID() {
  let asyncID = getContext<number>("$async-id")!;

  if (asyncID == null)
    throw new Error(
      "[vynn]: initializeAsyncID is not yet initialized, run it first before using getAsyncID",
    );

  modifyContext<number>("$async-id", (current) => current + 1);

  return asyncID;
}

export function getAsyncValues() {
  return getContext<any[]>("$async-values");
}

export function getAsyncValue(asyncID: number) {
  if (!getRenderMode()) {
    (window as any).__vynnAsyncData ??= [];
    try {
      return (window as any).__vynnAsyncData[asyncID];
    } finally {
      delete (window as any).__vynnAsyncData[asyncID];
    }
  }

  return undefined;
}
