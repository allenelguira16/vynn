import { getContext, modifyContext, setContext } from "../life-cycle/owner";

const LAZY_ID = Symbol("vynn.lazy-id");
const LAZY_ID_RESERVATIONS = Symbol("vynn.lazy-id-reservations");

type LazyIdScope = {
  prefix: string;
  next: number;
};

type LazyIDReservationRegistry = Map<string, number>;

export type LazyIDReservations = Record<string, number>;

export function initializeLazyContext() {
  setContext<LazyIdScope>(LAZY_ID, {
    prefix: "",
    next: 0,
  });
  setContext<LazyIDReservationRegistry>(LAZY_ID_RESERVATIONS, new Map([["", 0]]));
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
  const scope = getContext<LazyIdScope>(LAZY_ID);

  if (!scope) {
    throw new Error(
      "[vynn]: initializeLazyContext is not yet initialized, run it first before using getLazyID",
    );
  }

  const next = scope.next + 1;

  modifyContext<LazyIdScope>(LAZY_ID, (current) => ({
    ...current,
    next,
  }));

  const reservations = getContext<LazyIDReservationRegistry>(LAZY_ID_RESERVATIONS);
  if (reservations) {
    reservations.set(scope.prefix, Math.max(reservations.get(scope.prefix) ?? 0, next));
  }

  return scope.prefix ? `${scope.prefix}.${scope.next}` : String(scope.next);
}

/** Starts a new local lazy-ID sequence for descendants of one lazy instance. */
export function initializeLazyScope(lazyID: string): void {
  const reservations = getContext<LazyIDReservationRegistry>(LAZY_ID_RESERVATIONS);

  setContext<LazyIdScope>(LAZY_ID, {
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

  const registry = getContext<LazyIDReservationRegistry>(LAZY_ID_RESERVATIONS);
  const activeScope = getContext<LazyIdScope>(LAZY_ID);

  for (const [prefix, next] of Object.entries(reservations)) {
    if (!Number.isSafeInteger(next) || next < 0) continue;

    const previous = registry?.get(prefix) ?? 0;
    if (registry && next > previous) {
      registry.set(prefix, next);
    }

    if (activeScope?.prefix === prefix && next > activeScope.next) {
      modifyContext<LazyIdScope>(LAZY_ID, (current) => ({
        ...current,
        next: Math.max(current.next, next),
      }));
    }
  }
}

// LAZY PROMISES

const promisesInLazy = new WeakSet<Promise<unknown>>();

export function registerPromiseFromLazy(promise: Promise<unknown>) {
  promisesInLazy.add(promise);
}

export function isPromiseFromLazy(promise: Promise<unknown>) {
  return promisesInLazy.has(promise);
}

// LAZY GETTERS

const gettersInLazy = new Set<() => unknown>();

export function regsterAsyncGetterFromLazy<T = unknown>(getter: () => T) {
  gettersInLazy.add(getter);
}

export function isAsyncGetterFromLazy<T = unknown>(getter: () => T) {
  return gettersInLazy.has(getter);
}
