import { ASYNC_DATA_SSR_KEY } from "../const";
import { getOwnerIdentityPathKey } from "../life-cycle/owner";
import { getAsyncRenderContext } from "./async-render-context";

export const ASYNC_OWNER_ID_RESERVATIONS_KEY = "$VYNN_OWNER_ID_RESERVATIONS";

function getBrowserAsyncValues(): Record<string, unknown> | undefined {
  if (import.meta.env.SSR || typeof window === "undefined") return undefined;

  const values = (window as unknown as Record<string, unknown>)[ASYNC_DATA_SSR_KEY];
  return values !== null && typeof values === "object"
    ? (values as Record<string, unknown>)
    : undefined;
}

function hasOwnerIDReservation(
  values: Record<string, unknown>,
  ownerPath: readonly number[],
): boolean {
  const reservations = values[ASYNC_OWNER_ID_RESERVATIONS_KEY];
  return (
    Array.isArray(reservations) &&
    reservations.includes(getOwnerIdentityPathKey(ownerPath))
  );
}

export function initializeAsyncOwnerIDReservations(): void {
  getAsyncRenderContext()?.reservations.clear();
}

export function registerAsyncOwnerIDReservation(ownerPath: readonly number[]): void {
  if (!import.meta.env.SSR) return;
  getAsyncRenderContext()?.reservations.add(getOwnerIdentityPathKey(ownerPath));
}

export function getAsyncOwnerIDReservations(): string[] {
  return [...(getAsyncRenderContext()?.reservations ?? [])];
}

export function hasAsyncHydrationOwnerIDReservation(ownerPath: readonly number[]): boolean {
  const values = getBrowserAsyncValues();
  return values ? hasOwnerIDReservation(values, ownerPath) : false;
}

/** Check whether hydration carries an async value or a reserved resource slot. */
export function hasAsyncHydrationSlot(ownerPath: readonly number[]): boolean {
  const values = getBrowserAsyncValues();
  if (!values) return false;

  return (
    Object.prototype.hasOwnProperty.call(values, getOwnerIdentityPathKey(ownerPath)) ||
    hasOwnerIDReservation(values, ownerPath)
  );
}
