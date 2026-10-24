import { getContext, modifyContext, setContext } from "../life-cycle/owner";
import { isServer } from "./is-server-context";

export type AsyncBoundary<T = unknown> = (promise: Promise<T>) => void;

const ASYNC_BOUNDARY = Symbol("vynn.async-boundary");
const AWAIT_BOUNDARY = Symbol("vynn.await-boundary");
const ASYNC_ID = Symbol("vynn.async-id");
const ASYNC_VALUES = Symbol("vynn.async-values");

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
  setContext(ASYNC_ID, 0);
  setContext(ASYNC_VALUES, []);
}

export function getAsyncID() {
  let asyncID = getContext<number>(ASYNC_ID)!;

  if (asyncID == null)
    throw new Error(
      "[vynn]: initializeAsyncContext is not yet initialized, run it first before using getAsyncID",
    );

  modifyContext<number>(ASYNC_ID, (current) => current + 1);

  return asyncID;
}

export function getAsyncValues() {
  return getContext<any[]>(ASYNC_VALUES);
}

export function getAsyncValue(asyncID: number) {
  if (!isServer()) {
    (window as any).__vynnAsyncData ??= [];
    try {
      return (window as any).__vynnAsyncData[asyncID];
    } finally {
      delete (window as any).__vynnAsyncData[asyncID];
    }
  }

  return undefined;
}
