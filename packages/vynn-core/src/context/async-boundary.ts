import { getOwnerContext, setOwnerContext } from "./owner-context";

export type AsyncBoundary<T = unknown> = (promise: Promise<T>) => void;

const ASYNC_BOUNDARY = Symbol("vynn.async-boundary");
const AWAIT_BOUNDARY = Symbol("vynn.await-boundary");

export function isInsideAwaitBoundary(): boolean {
  return getOwnerContext<boolean>(AWAIT_BOUNDARY) ?? false;
}

export function getAsyncBoundary<T = unknown>(): AsyncBoundary<T> | undefined {
  return getOwnerContext<AsyncBoundary<T>>(ASYNC_BOUNDARY);
}

export function enterAsyncBoundary<T>(boundary: AsyncBoundary<T>): void {
  setOwnerContext(ASYNC_BOUNDARY, boundary);
  setOwnerContext(AWAIT_BOUNDARY, true);
}
