import { $renderEffect, $store, batch } from "vynn";

import type { Location, Route, RouterInstance, RouterOptions, RouterState } from "./types";

import { isServer } from "./environment";
import { createBrowserHistory, createMemoryHistory } from "./history";
import { compileRoutes, findRouteBranch, type MatchedRoute } from "./matcher";
import {
  parseLocation,
  registerLocationNavigation,
  updateDefaultLocation,
  updateLocation,
} from "./location";
import {
  getRouterMatchState,
  publishRouterMatchState,
  setRouterMatchState,
} from "./router-state";

type PreloadableComponent = Route["component"] & {
  preload?: () => Promise<unknown> | undefined;
};

function snapshotLocation(location: Location): Location {
  return {
    pathname: location.pathname,
    search: location.search,
  };
}

function sameBranch<TContext>(
  current: readonly MatchedRoute<TContext>[],
  next: readonly MatchedRoute<TContext>[],
): boolean {
  return (
    current.length === next.length &&
    current.every((match, index) => match.node === next[index]?.node)
  );
}

/**
 * Starts loading all lazy modules selected by a resolved route branch.
 * Already-loaded lazy components do not create promises, keeping warm
 * navigations synchronous.
 */
function preloadBranch<TContext>(
  branch: readonly MatchedRoute<TContext>[],
): Promise<void> | undefined {
  const pending: Promise<unknown>[] = [];

  const collect = (matches: readonly MatchedRoute<unknown>[]): void => {
    for (const match of matches) {
      const component = match.route.component as PreloadableComponent;
      const preload = component.preload;
      if (typeof preload === "function") {
        const result = preload();
        if (result) pending.push(result);
      }

      for (const slotBranch of Object.values(match.slots)) collect(slotBranch);
    }
  };

  collect(branch);

  return pending.length > 0
    ? Promise.allSettled(pending).then(() => undefined)
    : undefined;
}

/**
 * Creates an independent router instance.
 *
 * The router compiles route patterns once, resolves the destination branch
 * reactively when its location changes, and preloads that branch before
 * publishing it to the renderer. Route outlets only render the committed
 * branch.
 */
export function createRouter<TContext = undefined>(
  options: RouterOptions<TContext>,
): RouterInstance<TContext> {
  const compiledRoutes = compileRoutes(options.routes);
  const ownsHistory = options.history === undefined;
  const history =
    options.history ??
    (isServer
      ? createMemoryHistory({ initialEntries: [options.url ?? "/"] })
      : createBrowserHistory(options.url));

  const location = $store<Location>(parseLocation(history.location));
  const state: RouterState = { location };
  const matchState = {
    value: findRouteBranch<TContext>(compiledRoutes, snapshotLocation(location)),
  };

  let disposed = false;
  let navigationRevision = 0;
  let stopNavigationEffect = () => {};
  let stopListening = () => {};
  let unregisterLocationNavigation = () => {};

  const router: RouterInstance<TContext> = {
    routes: options.routes,
    context: options.context as TContext,
    history,
    state,
    notFound: options.notFound,

    navigate(to) {
      history.push(to);
    },

    replace(to) {
      history.replace(to);
    },

    dispose() {
      if (disposed) return;

      disposed = true;
      navigationRevision++;
      stopNavigationEffect();
      stopListening();
      unregisterLocationNavigation();

      if (ownsHistory) {
        history.dispose?.();
      }
    },
  };

  setRouterMatchState(router, matchState);
  unregisterLocationNavigation = registerLocationNavigation(location, router);

  /**
   * Resolves and optionally commits a history location.
   *
   * For history-driven navigation, outlets are notified before either location
   * store changes. Their view updates are therefore queued before effects in
   * the outgoing route that depend on $location, $params, or $search.
   *
   * The reactive location effect calls this without syncing the location store
   * so direct writes to router.state.location remain supported.
   */
  const resolveNavigation = (nextLocation: Location, syncLocation: boolean) => {
    const revision = ++navigationRevision;
    const nextBranch = findRouteBranch<TContext>(compiledRoutes, nextLocation);
    const branchChanged = !sameBranch(
      getRouterMatchState<TContext>(router).value,
      nextBranch,
    );

    const commit = () => {
      if (disposed || revision !== navigationRevision) return;

      batch(() => {
        if (branchChanged) {
          publishRouterMatchState(router, nextBranch);
        }

        if (syncLocation) {
          updateLocation(location, nextLocation);
          if (!isServer) {
            updateDefaultLocation(nextLocation);
          }
        }
      });
    };

    // Same-branch updates only change params/search and do not need module
    // loading. Empty branches also have nothing to preload.
    if (!branchChanged || isServer || nextBranch.length === 0) {
      commit();
      return;
    }

    const preload = preloadBranch(nextBranch);
    if (preload) {
      void preload.then(commit);
    } else {
      commit();
    }
  };

  // Keep direct reactive writes to router.state.location supported. Normal
  // history navigation is resolved synchronously in syncLocation below, ahead
  // of location notifications, to avoid an extra render of the outgoing page.
  stopNavigationEffect = $renderEffect(() => {
    resolveNavigation(snapshotLocation(location), false);
  });

  const syncLocation = (url: string) => {
    resolveNavigation(parseLocation(url), true);
  };

  stopListening = history.listen(syncLocation);

  if (!isServer) {
    updateDefaultLocation(location);
  }

  return router;
}
