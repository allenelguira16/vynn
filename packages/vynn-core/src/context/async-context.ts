import { ASYNC_DATA_SSR_KEY } from "../const";
import { getContext, modifyContext, setContext } from "../life-cycle/owner";
import { deserializeServerFunctionValue } from "../server-functions/serialization";
import { recordAsyncIDReservation } from "./hydration-id-context";
import { isServer } from "./is-server-context";

export type AsyncBoundary<T = unknown> = (promise: Promise<T>) => void;

const ASYNC_BOUNDARY = Symbol("vynn.async-boundary");
const AWAIT_BOUNDARY = Symbol("vynn.await-boundary");
const ASYNC_ID = Symbol("vynn.async-id");
const ASYNC_ID_RESERVATIONS = Symbol("vynn.async-id-reservations");
const ASYNC_VALUES = Symbol("vynn.async-values");

type AsyncIdScope = {
  prefix: string;
  next: number;
};

type AsyncIDReservationRegistry = Map<string, number>;

export type AsyncIDReservations = Record<string, number>;

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
  setContext<AsyncIDReservationRegistry>(ASYNC_ID_RESERVATIONS, new Map([["root", 0]]));
  setContext<Record<string, unknown>>(ASYNC_VALUES, Object.create(null));
}

/**
 * Give each lazy instance an independent async-data sequence.
 *
 * The sequence is inherited by ordinary descendants and shadowed by nested
 * lazy instances, so sibling module resolution order cannot exchange IDs.
 * A reservation restored from an ErrorBoundary is applied when that lazy
 * scope is initialized, even if its original owner was skipped during
 * hydration.
 */
export function initializeLazyAsyncScope(lazyID: string): void {
  const prefix = `lazy:${lazyID}`;
  const reservations = getContext<AsyncIDReservationRegistry>(ASYNC_ID_RESERVATIONS);

  setContext<AsyncIdScope>(ASYNC_ID, {
    prefix,
    next: reservations?.get(prefix) ?? 0,
  });
}

/**
 * Restore async-ID cursors for descendants skipped by an SSR-rendered
 * ErrorBoundary fallback. The active scope is advanced immediately; nested
 * lazy scopes consume their reserved cursor when they are initialized later.
 */
export function reserveAsyncIDReservations(reservations?: AsyncIDReservations): void {
  if (!reservations) return;

  const registry = getContext<AsyncIDReservationRegistry>(ASYNC_ID_RESERVATIONS);
  const activeScope = getContext<AsyncIdScope>(ASYNC_ID);

  for (const [prefix, next] of Object.entries(reservations)) {
    if (!Number.isSafeInteger(next) || next < 0) continue;

    const previous = registry?.get(prefix) ?? 0;
    if (registry && next > previous) {
      registry.set(prefix, next);
    }

    if (activeScope?.prefix === prefix && next > activeScope.next) {
      modifyContext<AsyncIdScope>(ASYNC_ID, (current) => ({
        ...current,
        next: Math.max(current.next, next),
      }));
    }
  }
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

  const next = scope.next + 1;

  modifyContext<AsyncIdScope>(ASYNC_ID, (current) => ({
    ...current,
    next,
  }));

  // Keep a shared record of allocations across nested owner and lazy scopes.
  // ErrorBoundary can then serialize the cursors for any descendants it skips.
  const reservations = getContext<AsyncIDReservationRegistry>(ASYNC_ID_RESERVATIONS);
  if (reservations) {
    reservations.set(scope.prefix, Math.max(reservations.get(scope.prefix) ?? 0, next));
  }
  recordAsyncIDReservation(scope.prefix, next);

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
