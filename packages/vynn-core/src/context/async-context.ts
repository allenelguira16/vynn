import { ASYNC_DATA_SSR_KEY } from "../const";
import { getContext, setContext } from "../life-cycle/owner";
import { deserializeServerFunctionValue } from "../server-functions/serialization";

export type AsyncBoundary<T = unknown> = (promise: Promise<T>) => void;

const ASYNC_BOUNDARY = Symbol("vynn.async-boundary");
const AWAIT_BOUNDARY = Symbol("vynn.await-boundary");
const ASYNC_VALUES = Symbol("vynn.async-values");
const ASYNC_OWNER_ID_RESERVATIONS = Symbol("vynn.async-owner-id-reservations");

/** Reserved metadata key stored alongside async values in the hydration payload. */
export const ASYNC_OWNER_ID_RESERVATIONS_KEY = "$VYNN_OWNER_ID_RESERVATIONS";

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
  setContext<Set<string>>(ASYNC_OWNER_ID_RESERVATIONS, new Set());
}

export function getAsyncValues(): Record<string, unknown> | undefined {
  return getContext<Record<string, unknown>>(ASYNC_VALUES);
}

/**
 * Preserve owner slots that were committed after a server-side suspension.
 * The initializer can complete synchronously on the client because its
 * dependencies were hydrated, but following resources must still use the
 * same IDs as they did on the server.
 */
export function registerAsyncOwnerIDReservation(ownerID: string): void {
  if (!import.meta.env.SSR) return;

  let reservations = getContext<Set<string>>(ASYNC_OWNER_ID_RESERVATIONS);

  if (!reservations) {
    reservations = new Set<string>();
    setContext(ASYNC_OWNER_ID_RESERVATIONS, reservations);
  }

  reservations.add(ownerID);
}

/** Return the owner slots that must be preserved by the hydration payload. */
export function getAsyncOwnerIDReservations(): string[] {
  return [...(getContext<Set<string>>(ASYNC_OWNER_ID_RESERVATIONS) ?? [])];
}

/** Check whether the server reserved an owner ID without serializing a value for it. */
export function hasAsyncHydrationOwnerIDReservation(ownerID: string): boolean {
  if (import.meta.env.SSR || typeof window === "undefined") return false;

  const values = (window as unknown as Record<string, unknown>)[ASYNC_DATA_SSR_KEY];

  if (values === null || typeof values !== "object") return false;

  const reservations = (values as Record<string, unknown>)[ASYNC_OWNER_ID_RESERVATIONS_KEY];

  return Array.isArray(reservations) && reservations.includes(ownerID);
}

/**
 * Check for a serialized result at a known owner ID without consuming it.
 * Maybe-async initializers use this to decide whether a fake hydration probe
 * is necessary before running the initializer for real.
 */
export function hasAsyncHydrationValue(ownerID: string): boolean {
  if (import.meta.env.SSR || typeof window === "undefined") return false;

  const values = (window as unknown as Record<string, unknown>)[ASYNC_DATA_SSR_KEY];

  return (
    values !== null &&
    typeof values === "object" &&
    Object.prototype.hasOwnProperty.call(values, ownerID)
  );
}

/**
 * Read one serialized result without confusing a valid falsy value with a
 * missing entry. The key is the async resource owner's stable hydration ID.
 */
export function getAsyncValue<T = unknown>(ownerID: string): AsyncHydrationValue<T> {
  if (import.meta.env.SSR) {
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
