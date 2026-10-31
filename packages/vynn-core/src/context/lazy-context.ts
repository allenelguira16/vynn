import { getContext, modifyContext, setContext } from "../life-cycle/owner";

// LAZY ID CONTEXT

const LAZY_ID = Symbol("vynn.lazy-id");

type LazyIdScope = {
  prefix: string;
  next: number;
};

export function initializeLazyContext() {
  setContext<LazyIdScope>(LAZY_ID, {
    prefix: "",
    next: 0,
  });
}

/**
 * Creates a lazy ID from the current boundary's local sequence.
 *
 * Nested lazy components use their parent's ID as a prefix, so loading two
 * parent chunks in a different order cannot change either parent's child IDs.
 */
export function getLazyID(): string {
  const scope = getContext<LazyIdScope>(LAZY_ID);

  if (!scope) {
    throw new Error(
      "[vynn]: initializeLazyContext is not yet initialized, run it first before using getLazyID",
    );
  }

  modifyContext<LazyIdScope>(LAZY_ID, (current) => ({
    ...current,
    next: current.next + 1,
  }));

  return scope.prefix ? `${scope.prefix}.${scope.next}` : String(scope.next);
}

/** Starts a new local lazy-ID sequence for descendants of one lazy instance. */
export function initializeLazyScope(lazyID: string): void {
  setContext<LazyIdScope>(LAZY_ID, {
    prefix: lazyID,
    next: 0,
  });
}

// LAZY PROMISES

const promisesInLazy = new Set<Promise<unknown>>();

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
