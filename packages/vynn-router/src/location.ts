import { $store } from "vynn";

import { useRouterLocation } from "./context";
import { isServer } from "./environment";
import type { Location } from "./types";

/**
 * Browser location shared by the active CSR router.
 *
 * On the server, each Router creates its own request-local store instead,
 * preventing concurrent requests from sharing location state.
 */
export const $location = $store<Location>({
  pathname: !isServer ? window.location.pathname : "/",
  search: !isServer ? window.location.search : "",
});

if (!isServer) {
  window.addEventListener("popstate", () => {
    updateLocation($location, {
      pathname: window.location.pathname,
      search: window.location.search,
    });
  });
}

function tryGetRouterLocation(): Location | undefined {
  try {
    return useRouterLocation();
  } catch {
    return undefined;
  }
}

/** Returns the active Router location, falling back to the CSR singleton. */
export function currentLocation(): Location {
  return tryGetRouterLocation() ?? $location;
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
 * Updates the browser URL and the active reactive location.
 *
 * CSR always resolves to the shared $location store, including after an await
 * when the synchronous owner context is no longer available. SSR continues to
 * update the request-local Router store.
 */
export function navigate(path: string, location?: Location): void {
  const targetLocation = location ?? tryGetRouterLocation() ?? $location;
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
  }

  updateLocation(targetLocation, next);

  // The legacy CSR singleton and the Router context refer to the same object.
  // Keep this assignment for explicit external location arguments as well.
  if (!isServer && targetLocation !== $location) {
    updateLocation($location, next);
  }
}
