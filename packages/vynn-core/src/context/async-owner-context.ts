import { ASYNC_DATA_SSR_KEY } from "../const";
import { getContext, setContext } from "../life-cycle/owner";

const ASYNC_OWNER_ID_RESERVATIONS = Symbol("vynn.async-owner-id-reservations");

export const ASYNC_OWNER_ID_RESERVATIONS_KEY = "$VYNN_OWNER_ID_RESERVATIONS";

export function initializeAsyncOwnerIDReservations(): void {
  setContext<Set<string>>(ASYNC_OWNER_ID_RESERVATIONS, new Set());
}

export function registerAsyncOwnerIDReservation(ownerID: string): void {
  if (!import.meta.env.SSR) return;

  let reservations = getContext<Set<string>>(ASYNC_OWNER_ID_RESERVATIONS);
  if (!reservations) {
    reservations = new Set<string>();
    setContext(ASYNC_OWNER_ID_RESERVATIONS, reservations);
  }

  reservations.add(ownerID);
}

export function getAsyncOwnerIDReservations(): string[] {
  return [...(getContext<Set<string>>(ASYNC_OWNER_ID_RESERVATIONS) ?? [])];
}

export function hasAsyncHydrationOwnerIDReservation(ownerID: string): boolean {
  if (import.meta.env.SSR || typeof window === "undefined") return false;

  const values = (window as unknown as Record<string, unknown>)[ASYNC_DATA_SSR_KEY];
  if (values === null || typeof values !== "object") return false;

  const reservations = (values as Record<string, unknown>)[ASYNC_OWNER_ID_RESERVATIONS_KEY];
  return Array.isArray(reservations) && reservations.includes(ownerID);
}
