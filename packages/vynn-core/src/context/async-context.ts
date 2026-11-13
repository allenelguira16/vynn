import { ASYNC_DATA_SSR_KEY } from "../const";
import { getContext, setContext } from "../life-cycle/owner";
import { deserializeServerFunctionValue } from "../server-functions/serialization";
import { isServer } from "./is-server-context";

export type AsyncBoundary<T = unknown> = (promise: Promise<T>) => void;

const ASYNC_BOUNDARY = Symbol("vynn.async-boundary");
const AWAIT_BOUNDARY = Symbol("vynn.await-boundary");
const ASYNC_ID = Symbol("vynn.async-id");
const ASYNC_VALUES = Symbol("vynn.async-values");

export type AsyncIDScope = {
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
  setContext<AsyncIDScope>(ASYNC_ID, {
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
  setContext<AsyncIDScope>(ASYNC_ID, {
    prefix: `lazy:${lazyID}`,
    next: 0,
  });
}

/**
 * Create independent async hydration sequences for an ErrorBoundary's two
 * render branches. A failed SSR child branch is not evaluated during client
 * hydration, so its resources must not consume IDs belonging to later
 * siblings or to the boundary's fallback.
 */
export function createErrorBoundaryAsyncScopes(id: number): {
  children: AsyncIDScope | undefined;
  fallback: AsyncIDScope | undefined;
} {
  if (!getContext<AsyncIDScope>(ASYNC_ID)) {
    return { children: undefined, fallback: undefined };
  }

  return {
    children: { prefix: `boundary:${id}:children`, next: 0 },
    fallback: { prefix: `boundary:${id}:fallback`, next: 0 },
  };
}

/** Install a branch-specific async identity scope on the current owner. */
export function enterAsyncIDScope(scope: AsyncIDScope | undefined): void {
  if (scope) setContext(ASYNC_ID, scope);
}

/**
 * Returns the next async hydration ID when an async context is available.
 *
 * Async resources may be created outside a component or Vynn render tree.
 * Those resources simply skip SSR result serialization and hydration
 * restoration because there is no request-scoped async value registry.
 */
export function getAsyncIDIfAvailable(): string | undefined {
  const scope = getContext<AsyncIDScope>(ASYNC_ID);

  if (!scope) {
    return undefined;
  }

  const id = `${scope.prefix}:${scope.next}`;
  scope.next++;

  return id;
}

/**
 * Returns the next async hydration ID.
 *
 * Use this when an async ID is required by the caller. Async resource
 * primitives should use getAsyncIDIfAvailable() so they can also be created
 * outside a component or initialized render context.
 */
export function getAsyncID(): string {
  const asyncID = getAsyncIDIfAvailable();

  if (asyncID === undefined) {
    throw new Error(
      "[vynn]: initializeAsyncContext is not yet initialized, run it first before using getAsyncID",
    );
  }

  return asyncID;
}

export function getAsyncValues(): Record<string, unknown> | undefined {
  return getContext<Record<string, unknown>>(ASYNC_VALUES);
}

/**
 * Read one serialized result without confusing a valid falsy value with a
 * missing entry. The key is consumed once so later async instances cannot
 * accidentally reuse it.
 */
export function getAsyncValue<T = unknown>(asyncID: string): AsyncHydrationValue<T> {
  if (isServer()) {
    return { found: false, value: undefined };
  }

  const values = (window as unknown as Record<string, unknown>)[ASYNC_DATA_SSR_KEY] as
    | Record<string, unknown>
    | undefined;

  if (!values || !Object.prototype.hasOwnProperty.call(values, asyncID)) {
    return { found: false, value: undefined };
  }

  const encodedValue = values[asyncID];
  delete values[asyncID];

  return {
    found: true,
    value: deserializeServerFunctionValue(encodedValue) as T,
  };
}
