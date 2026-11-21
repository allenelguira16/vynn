import { ASYNC_DATA_SSR_KEY } from "../const";
import { getOwnerIdentityPathKey } from "../life-cycle/owner";
import { getAsyncRenderContext } from "./async-render-context";

export const ASYNC_OWNER_ID_RESERVATIONS_KEY = "$VYNN_OWNER_ID_RESERVATIONS";

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
  if (import.meta.env.SSR || typeof window === "undefined") return false;

  const values = (window as unknown as Record<string, unknown>)[ASYNC_DATA_SSR_KEY];
  if (values === null || typeof values !== "object") return false;

  const reservations = (values as Record<string, unknown>)[ASYNC_OWNER_ID_RESERVATIONS_KEY];
  return (
    Array.isArray(reservations) &&
    reservations.includes(getOwnerIdentityPathKey(ownerPath))
  );
}
