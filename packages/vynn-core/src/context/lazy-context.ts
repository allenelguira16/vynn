import {
  getOwnerContext,
  modifyOwnerContext,
  setOwnerContext,
  setRootOwnerContext,
} from "./owner-context";

const LAZY_ID = Symbol("vynn.lazy-id");
const LAZY_ID_RESERVATIONS = Symbol("vynn.lazy-id-reservations");

type LazyIdScope = {
  prefix: string;
  next: number;
};

type LazyIDReservationRegistry = Map<string, number>;

export type LazyIDReservations = Record<string, number>;

export function initializeLazyContext() {
  setRootOwnerContext<LazyIdScope>(LAZY_ID, {
    prefix: "",
    next: 0,
  });
  setRootOwnerContext<LazyIDReservationRegistry>(LAZY_ID_RESERVATIONS, new Map([["", 0]]));
}

/**
 * Creates a lazy ID from the current boundary's local sequence.
 *
 * Nested lazy components use their parent's ID as a prefix, so loading two
 * parent chunks in a different order cannot change either parent's child IDs.
 * The shared registry lets ErrorBoundary restore IDs allocated by descendants
 * it skips during hydration.
 */
export function getLazyID(): string {
  let scope = getOwnerContext<LazyIdScope>(LAZY_ID);

  // Lazy identity state is allocated only when the first lazy component is used.
  if (!scope) {
    initializeLazyContext();
    scope = getOwnerContext<LazyIdScope>(LAZY_ID);
  }

  if (!scope) {
    throw new Error("[vynn]: lazy() requires an active owner.");
  }

  const next = scope.next + 1;

  modifyOwnerContext<LazyIdScope>(LAZY_ID, (current) => ({
    ...current,
    next,
  }));

  const reservations = getOwnerContext<LazyIDReservationRegistry>(LAZY_ID_RESERVATIONS);
  if (reservations) {
    reservations.set(scope.prefix, Math.max(reservations.get(scope.prefix) ?? 0, next));
  }

  return scope.prefix ? `${scope.prefix}.${scope.next}` : String(scope.next);
}

/** Starts a new local lazy-ID sequence for descendants of one lazy instance. */
export function initializeLazyScope(lazyID: string): void {
  const reservations = getOwnerContext<LazyIDReservationRegistry>(LAZY_ID_RESERVATIONS);

  setOwnerContext<LazyIdScope>(LAZY_ID, {
    prefix: lazyID,
    next: reservations?.get(lazyID) ?? 0,
  });
}

/**
 * Restore lazy-ID cursors for descendants skipped by an SSR-rendered
 * ErrorBoundary fallback. The active scope advances immediately; nested
 * scopes use their reserved cursor when initializeLazyScope() is called.
 */
export function reserveLazyIDReservations(reservations?: LazyIDReservations): void {
  if (!reservations) return;

  const registry = getOwnerContext<LazyIDReservationRegistry>(LAZY_ID_RESERVATIONS);
  const activeScope = getOwnerContext<LazyIdScope>(LAZY_ID);

  for (const [prefix, next] of Object.entries(reservations)) {
    if (!Number.isSafeInteger(next) || next < 0) continue;

    const previous = registry?.get(prefix) ?? 0;
    if (registry && next > previous) {
      registry.set(prefix, next);
    }

    if (activeScope?.prefix === prefix && next > activeScope.next) {
      modifyOwnerContext<LazyIdScope>(LAZY_ID, (current) => ({
        ...current,
        next: Math.max(current.next, next),
      }));
    }
  }
}
