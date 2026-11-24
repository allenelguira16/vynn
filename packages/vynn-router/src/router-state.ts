import type { MatchedRoute } from "./matcher";

export type RouterMatchState<TContext = undefined> = {
  value: readonly MatchedRoute<TContext>[];
};

const routerMatchStates = new WeakMap<object, RouterMatchState<unknown>>();

/** Associates the router's resolved branch with its public instance. */
export function setRouterMatchState<TContext>(
  router: object,
  state: RouterMatchState<TContext>,
): void {
  routerMatchStates.set(router, state as unknown as RouterMatchState<unknown>);
}

/** Reads the resolved branch for the renderer without exposing it publicly. */
export function getRouterMatchState<TContext>(
  router: object,
): RouterMatchState<TContext> {
  const state = routerMatchStates.get(router);
  if (!state) {
    throw new Error("[vynn-router]: Router state is not initialized.");
  }

  return state as unknown as RouterMatchState<TContext>;
}
