import { $store } from "vynn";

import { useRouterLocation } from "./context";
import { isServer } from "./environment";
import type { Location } from "./types";

/**
 * Legacy/default location store. The router uses a per-Router store in context
 * so multiple concurrent SSR requests never mutate one module-level location.
 */
export const $location = $store<Location>({
  pathname: !isServer ? window.location.pathname : "/",
  search: !isServer ? window.location.search : "",
});

// Browser routers register their request-local stores here. This allows an
// async redirect (where Vynn's synchronous owner context is no longer active)
// to update the Router store that RouteOutlet actually observes.
const routerLocations = new Set<Location>();

export function registerRouterLocation(location: Location): () => void {
  if (isServer) return () => {};

  routerLocations.add(location);

  return () => {
    routerLocations.delete(location);
  };
}

if (!isServer) {
  window.addEventListener("popstate", () => {
    const next = {
      pathname: window.location.pathname,
      search: window.location.search,
    };

    updateLocation($location, next);

    for (const location of routerLocations) {
      updateLocation(location, next);
    }
  });
}

/**
 * Returns the active Router location, or the legacy store when used outside
 * a Router. Consumers that need to distinguish the two should use
 * tryGetRouterLocation().
 */
export function currentLocation(): Location {
  return tryGetRouterLocation() ?? $location;
}

/** Returns the context-bound Router location when an owner is active. */
function tryGetRouterLocation(): Location | undefined {
  try {
    return useRouterLocation();
  } catch {
    return undefined;
  }
}

/** Parses a URL into the location shape used by the router. */
export function parseLocation(url?: string): Location {
  const fallback = !isServer
    ? window.location.pathname + window.location.search
    : "/";
  const parsed = new URL(url || fallback, "http://vynn.local");

  return {
    pathname: parsed.pathname,
    search: parsed.search,
  };
}

export function updateLocation(target: Location, next: Location): void {
  target.pathname = next.pathname;
  target.search = next.search;
}

/**
 * Updates the current URL and reactive location state.
 *
 * A synchronous call inside a Router updates that Router directly. When called
 * after an await, the owner context may be gone; in that case all currently
 * mounted Router stores are synchronized from the browser URL.
 */
export function navigate(path: string, location?: Location): void {
  const contextualLocation = location ?? tryGetRouterLocation();
  const targetLocation = contextualLocation ?? $location;

  const target = new URL(
    path,
    "http://vynn.local" + targetLocation.pathname + targetLocation.search,
  );
  const next = {
    pathname: target.pathname,
    search: target.search,
  };

  if (
    next.pathname === targetLocation.pathname &&
    next.search === targetLocation.search &&
    !target.hash
  ) {
    return;
  }

  if (!isServer) {
    history.pushState(null, "", target.pathname + target.search + target.hash);

    if (contextualLocation) {
      updateLocation(contextualLocation, next);
    } else {
      // No owner is active (typically an async beforeLoad continuation).
      // Update each active Router rather than only the legacy singleton.
      for (const routerLocation of routerLocations) {
        updateLocation(routerLocation, next);
      }
    }

    updateLocation($location, next);
    window.dispatchEvent(new Event("vynn:navigate"));
  } else {
    updateLocation(targetLocation, next);
  }
}
