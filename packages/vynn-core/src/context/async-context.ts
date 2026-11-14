import { ASYNC_DATA_SSR_KEY } from "../const";
import {
  getContext,
  getOwnerBoundaryHandler,
  modifyContext,
  setContext,
  setOwnerBoundaryHandler,
} from "../life-cycle/owner";
import { deserializeServerFunctionValue } from "../server-functions/serialization";
import { isServer } from "./is-server-context";

export type AsyncBoundary<T = unknown> = (promise: Promise<T>) => void;

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
  return getOwnerBoundaryHandler("onPending") !== undefined;
}

export function getAsyncBoundary<T = unknown>(): AsyncBoundary<T> | undefined {
  return getOwnerBoundaryHandler("onPending") as AsyncBoundary<T> | undefined;
}

/**
 * Installs a pending handler on the current owner. Descendant resources find
 * it through owner ancestry, without a separate async-boundary context value.
 */
export function enterAsyncBoundary<T>(boundary: AsyncBoundary<T>): void {
  setOwnerBoundaryHandler("onPending", boundary as (promise: Promise<unknown>) => void);
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

/**
 * Returns the next async hydration ID when an async context is available.
 *
 * Async resources may be created outside a component or Vynn render tree.
 * Those resources simply skip SSR result serialization and hydration
 * restoration because there is no request-scoped async value registry.
 */
export function getAsyncIDIfAvailable(): string | undefined {
  const scope = getContext<AsyncIdScope>(ASYNC_ID);

  if (!scope) {
    return undefined;
  }

  modifyContext<AsyncIdScope>(ASYNC_ID, (current) => ({
    ...current,
    next: current.next + 1,
  }));

  return `${scope.prefix}:${scope.next}`;
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
