import { getContext, setContext } from "../life-cycle/owner";

export type AsyncBoundary<T = unknown> = (promise: Promise<T>) => void;

const ASYNC_BOUNDARY = Symbol("vynn.async-boundary");
const AWAIT_BOUNDARY = Symbol("vynn.await-boundary");

export function isInsideAwaitBoundary(): boolean {
  return getContext<boolean>(AWAIT_BOUNDARY) ?? false;
}

export function getAsyncBoundary<T = unknown>(): AsyncBoundary<T> | undefined {
  return getContext<AsyncBoundary<T>>(ASYNC_BOUNDARY);
}

/** Permanently sets the active Await boundary on the current owner. */
export function enterAsyncBoundary<T>(boundary: AsyncBoundary<T>): void {
  setContext(ASYNC_BOUNDARY, boundary);
  setContext(AWAIT_BOUNDARY, true);
}
