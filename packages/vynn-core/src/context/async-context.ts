import { ASYNC_DATA_SSR_KEY } from "../const";
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
