import { ASYNC_DATA_SSR_KEY } from "../const";
import { getContext, setContext } from "../life-cycle/owner";
import { deserializeServerFunctionValue } from "../server-functions/serialization";
import { isServer } from "./is-server-context";

export type AsyncBoundary<T = unknown> = (promise: Promise<T>) => void;

const ASYNC_BOUNDARY = Symbol("vynn.async-boundary");
const AWAIT_BOUNDARY = Symbol("vynn.await-boundary");
const ASYNC_VALUES = Symbol("vynn.async-values");

export type AsyncHydrationValue<T = unknown> = {
  found: boolean;
  value: T | undefined;
};

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

/** Initialize the request-local async hydration value registry. */
export function initializeAsyncContext(): void {
  setContext<Record<string, unknown>>(ASYNC_VALUES, Object.create(null));
}

export function getAsyncValues(): Record<string, unknown> | undefined {
  return getContext<Record<string, unknown>>(ASYNC_VALUES);
}

/**
 * Read one serialized result without confusing a valid falsy value with a
 * missing entry. The key is the async resource owner's stable hydration ID.
 */
export function getAsyncValue<T = unknown>(ownerID: string): AsyncHydrationValue<T> {
  if (isServer()) {
    return { found: false, value: undefined };
  }

  const values = (window as unknown as Record<string, unknown>)[ASYNC_DATA_SSR_KEY] as
    | Record<string, unknown>
    | undefined;

  if (!values || !Object.prototype.hasOwnProperty.call(values, ownerID)) {
    return { found: false, value: undefined };
  }

  const encodedValue = values[ownerID];
  delete values[ownerID];

  return {
    found: true,
    value: deserializeServerFunctionValue(encodedValue) as T,
  };
}
