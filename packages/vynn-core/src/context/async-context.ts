import { ASYNC_DATA_SSR_KEY } from "../const";
import {
  getOwnerIdentityPathKey,
} from "../life-cycle/owner";
import {
  getAsyncRenderContext,
  initializeAsyncRenderContext,
} from "./async-render-context";
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

/** Initialize the request-local async hydration value registry. */
export function initializeAsyncContext(): void {
  initializeAsyncRenderContext();
  initializeAsyncOwnerIDReservations();
}

export function getAsyncValues(): Record<string, unknown> | undefined {
  return getAsyncRenderContext()?.values;
}

/** Check for a serialized result at a known numeric owner-index path. */
export function hasAsyncHydrationValue(ownerPath: readonly number[]): boolean {
  if (import.meta.env.SSR || typeof window === "undefined") return false;

  const values = (window as unknown as Record<string, unknown>)[ASYNC_DATA_SSR_KEY];
  if (!values || typeof values !== "object") return false;

  return Object.prototype.hasOwnProperty.call(
    values,
    getOwnerIdentityPathKey(ownerPath),
  );
}
