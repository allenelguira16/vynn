import type { MatchedRoute } from "./matcher";

export type RouterMatchState<TContext = undefined> = {
  value: readonly MatchedRoute<TContext>[];
};

type RouterMatchListener<TContext> = (
  branch: readonly MatchedRoute<TContext>[],
) => void;

type RouterMatchEntry<TContext> = {
  state: RouterMatchState<TContext>;
  listeners: Set<RouterMatchListener<TContext>>;
};

const routerMatchStates = new WeakMap<object, RouterMatchEntry<unknown>>();

/** Associates the router's resolved branch with its public instance. */
export function setRouterMatchState<TContext>(
  router: object,
  state: RouterMatchState<TContext>,
): void {
  routerMatchStates.set(router, {
    state: state as unknown as RouterMatchState<unknown>,
    listeners: new Set(),
  });
}

/** Reads the currently committed branch for the router. */
export function getRouterMatchState<TContext>(
  router: object,
): RouterMatchState<TContext> {
  const entry = routerMatchStates.get(router);
  if (!entry) {
    throw new Error("[vynn-router]: Router state is not initialized.");
  }

  return entry.state as unknown as RouterMatchState<TContext>;
}

/**
 * Subscribes an outlet to committed route branches.
 *
 * Outlets are notified synchronously when the router publishes a branch. This
 * lets them queue their view reconciliation before location subscribers are
 * notified in the same navigation batch.
 */
export function subscribeRouterMatchState<TContext>(
  router: object,
  listener: RouterMatchListener<TContext>,
): () => void {
  const entry = routerMatchStates.get(router);
  if (!entry) {
    throw new Error("[vynn-router]: Router state is not initialized.");
  }

  const listeners = entry.listeners as Set<RouterMatchListener<TContext>>;
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Publishes the next branch to outlets before the location store is updated.
 * This ordering prevents the outgoing route from rendering against the
 * destination URL immediately before it is disposed.
 */
export function publishRouterMatchState<TContext>(
  router: object,
  branch: readonly MatchedRoute<TContext>[],
): void {
  const entry = routerMatchStates.get(router);
  if (!entry) {
    throw new Error("[vynn-router]: Router state is not initialized.");
  }

  // Update the branch snapshot first so any nested outlet created during a
  // listener callback sees the destination branch immediately.
  (entry.state as RouterMatchState<TContext>).value = branch;

  const listeners = entry.listeners as Set<RouterMatchListener<TContext>>;
  for (const listener of Array.from(listeners)) {
    listener(branch);
  }
}
