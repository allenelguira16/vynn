import { $store } from "vynn";

import type { Location, RouterInstance, RouterOptions, RouterState } from "./types";

import { createBrowserHistory, createMemoryHistory } from "./history";
import { isServer } from "./environment";
import {
  parseLocation,
  registerLocationNavigation,
  updateDefaultLocation,
  updateLocation,
} from "./location";

/**
 * Creates an independent router instance.
 *
 * Create one instance per application in the browser and one per request
 * during SSR. The returned state is reactive and can be read outside the
 * rendered Router component.
 */
export function createRouter<TContext = undefined>(
  options: RouterOptions<TContext>,
): RouterInstance<TContext> {
  const ownsHistory = options.history === undefined;
  const history =
    options.history ??
    (isServer
      ? createMemoryHistory({ initialEntries: [options.url ?? "/"] })
      : createBrowserHistory(options.url));

  const location = $store<Location>(parseLocation(history.location));
  const state: RouterState = { location };

  const syncLocation = (url: string) => {
    const next = parseLocation(url);
    updateLocation(location, next);

    if (!isServer) {
      updateDefaultLocation(next);
    }
  };

  // The router instance owns its history subscription, not the rendered
  // Router component. It remains usable before, during, and after rendering.
  const stopListening = history.listen(syncLocation);
  let disposed = false;
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
      stopListening();
      unregisterLocationNavigation();

      if (ownsHistory) {
        history.dispose?.();
      }
    },
  };

  unregisterLocationNavigation = registerLocationNavigation(location, router);

  if (!isServer) {
    updateDefaultLocation(location);
  }

  return router;
}
