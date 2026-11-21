import { ASYNC_DATA_SSR_KEY } from "../const";
import { deserializeServerFunctionValue } from "../server-functions/serialization";
import { getContext, setContext } from "../life-cycle/owner";
import { initializeAsyncOwnerIDReservations } from "./async-owner-context";

export {
  ASYNC_OWNER_ID_RESERVATIONS_KEY,
  getAsyncOwnerIDReservations,
  hasAsyncHydrationOwnerIDReservation,
  registerAsyncOwnerIDReservation,
} from "./async-owner-context";
export type { AsyncBoundary } from "./async-boundary";
export {
  enterAsyncBoundary,
  getAsyncBoundary,
  isInsideAwaitBoundary,
} from "./async-boundary";

const ASYNC_VALUES = Symbol("vynn.async-values");

export type AsyncHydrationValue<T = unknown> = {
  found: boolean;
  value: T | undefined;
};

/** Initialize the request-local async hydration value registry. */
export function initializeAsyncContext(): void {
  setContext<Record<string, unknown>>(ASYNC_VALUES, Object.create(null));
  initializeAsyncOwnerIDReservations();
}

export function getAsyncValues(): Record<string, unknown> | undefined {
  return getContext<Record<string, unknown>>(ASYNC_VALUES);
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
