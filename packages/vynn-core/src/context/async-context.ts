import { ASYNC_DATA_SSR_KEY } from "../const";
import { getContext, modifyContext, setContext } from "../life-cycle/owner";
import { isServer } from "./is-server-context";

export type AsyncBoundary<T = unknown> = (promise: Promise<T>) => void;

const ASYNC_BOUNDARY = Symbol("vynn.async-boundary");
const AWAIT_BOUNDARY = Symbol("vynn.await-boundary");
const ASYNC_ID = Symbol("vynn.async-id");
const ASYNC_VALUES = Symbol("vynn.async-values");

type AsyncIdScope = {
  prefix: string;
  next: number;
};

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

export function initializeAsyncContext(): void {
  setContext<AsyncIdScope>(ASYNC_ID, {
    prefix: "root",
    next: 0,
  });
  setContext<Record<string, unknown>>(ASYNC_VALUES, Object.create(null));
}

/**
 * Give each lazy instance an independent async-data sequence.
 *
 * The sequence is inherited by ordinary descendants and shadowed by nested
 * lazy instances, so sibling module resolution order cannot exchange IDs.
 */
export function initializeLazyAsyncScope(lazyID: string): void {
  setContext<AsyncIdScope>(ASYNC_ID, {
    prefix: `lazy:${lazyID}`,
    next: 0,
  });
}

export function getAsyncID(): string {
  const scope = getContext<AsyncIdScope>(ASYNC_ID);

  if (!scope) {
    throw new Error(
      "[vynn]: initializeAsyncContext is not yet initialized, run it first before using getAsyncID",
    );
  }

  modifyContext<AsyncIdScope>(ASYNC_ID, (current) => ({
    ...current,
    next: current.next + 1,
  }));

  return `${scope.prefix}:${scope.next}`;
}

export function getAsyncValues(): Record<string, unknown> | undefined {
  return getContext<Record<string, unknown>>(ASYNC_VALUES);
}

/**
 * Read one serialized result without confusing a valid falsy value with a
 * missing entry. The key is consumed once so later async instances cannot
 * accidentally reuse it.
 */
export function getAsyncValue<T = unknown>(
  asyncID: string,
): AsyncHydrationValue<T> {
  if (isServer()) {
    return { found: false, value: undefined };
  }

  const values = (window as unknown as Record<string, unknown>)[
    ASYNC_DATA_SSR_KEY
  ] as Record<string, unknown> | undefined;

  if (!values || !Object.prototype.hasOwnProperty.call(values, asyncID)) {
    return { found: false, value: undefined };
  }

  const value = values[asyncID] as T;
  delete values[asyncID];

  return {
    found: true,
    value,
  };
}
