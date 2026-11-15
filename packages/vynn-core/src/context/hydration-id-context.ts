import { getContext, setContext } from "../life-cycle/owner";

const HYDRATION_ID_TRACKERS = Symbol("vynn.hydration-id-trackers");

export type HydrationIDTracker = {
  asyncIDs: Map<string, number>;
  lazyIDs: Map<string, number>;
};

export type HydrationIDReservations = {
  asyncIDs?: Record<string, number>;
  lazyIDs?: Record<string, number>;
};

/** Create a tracker for the IDs allocated by one ErrorBoundary subtree. */
export function createHydrationIDTracker(): HydrationIDTracker {
  return {
    asyncIDs: new Map(),
    lazyIDs: new Map(),
  };
}

/**
 * Add a tracker to the current owner context.
 *
 * Trackers are inherited as a stack so nested ErrorBoundaries record their
 * own allocations while outer boundaries still account for the full subtree.
 */
export function enterHydrationIDTracker(tracker: HydrationIDTracker): void {
  const inherited = getContext<HydrationIDTracker[]>(HYDRATION_ID_TRACKERS) ?? [];
  setContext(HYDRATION_ID_TRACKERS, [...inherited, tracker]);
}

export function recordAsyncIDReservation(prefix: string, next: number): void {
  const trackers = getContext<HydrationIDTracker[]>(HYDRATION_ID_TRACKERS);

  for (const tracker of trackers ?? []) {
    tracker.asyncIDs.set(prefix, Math.max(tracker.asyncIDs.get(prefix) ?? 0, next));
  }
}

export function recordLazyIDReservation(prefix: string, next: number): void {
  const trackers = getContext<HydrationIDTracker[]>(HYDRATION_ID_TRACKERS);

  for (const tracker of trackers ?? []) {
    tracker.lazyIDs.set(prefix, Math.max(tracker.lazyIDs.get(prefix) ?? 0, next));
  }
}

/** Read the current reservations, including allocations made by deferred SSR retries. */
export function getHydrationIDReservations(
  tracker: HydrationIDTracker,
): HydrationIDReservations {
  return {
    ...(tracker.asyncIDs.size > 0 ? { asyncIDs: Object.fromEntries(tracker.asyncIDs) } : {}),
    ...(tracker.lazyIDs.size > 0 ? { lazyIDs: Object.fromEntries(tracker.lazyIDs) } : {}),
  };
}
