import { $renderEffect, $state, $store, untrack } from "vynn";

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
import { setRouterMatchState } from "./router-state";

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

  for (const match of branch) {
    const component = match.route.component as PreloadableComponent;
    const preload = component.preload;
    if (typeof preload !== "function") continue;

    const result = preload();
    if (result) pending.push(result);
  }

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
  const matchState = $state<readonly MatchedRoute<TContext>[]>(
    findRouteBranch<TContext>(compiledRoutes, snapshotLocation(location)),
  );

  let disposed = false;
  let navigationRevision = 0;
  let stopNavigationEffect = () => {};
  let unregisterLocationNavigation = () => {};

  // Location is the only reactive navigation input. Direct updates through
  // router.state.location and $location therefore follow the same resolver
  // as history.push(), history.replace(), and browser popstate.
  stopNavigationEffect = $renderEffect(() => {
    const nextLocation = snapshotLocation(location);
    const revision = ++navigationRevision;
    const nextBranch = findRouteBranch<TContext>(compiledRoutes, nextLocation);

    // Parameter- and query-only changes preserve all route component owners.
    if (sameBranch(untrack(() => matchState.value), nextBranch)) return;

    const commit = () => {
      if (disposed || revision !== navigationRevision) return;

      const latest = snapshotLocation(location);
      if (
        latest.pathname !== nextLocation.pathname ||
        latest.search !== nextLocation.search
      ) {
        return;
      }

      matchState.value = nextBranch;
    };

    if (isServer || nextBranch.length === 0) {
      commit();
      return;
    }

    const preload = preloadBranch(nextBranch);
    if (preload) {
      void preload.then(commit);
    } else {
      commit();
    }
  });

  const syncLocation = (url: string) => {
    const next = parseLocation(url);
    updateLocation(location, next);

    if (!isServer) {
      updateDefaultLocation(next);
    }
  };

  const stopListening = history.listen(syncLocation);

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

  if (!isServer) {
    updateDefaultLocation(location);
  }

  return router;
}
