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

if (!isServer) {
  window.addEventListener("popstate", () => {
    $location.pathname = window.location.pathname;
    $location.search = window.location.search;
  });
}

export function currentLocation(): Location {
  try {
    return useRouterLocation();
  } catch {
    // Public helpers can also be used outside a Router. Keep the original
    // module-level location store as a compatibility fallback for those callers.
    return $location;
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
 * When called within a Router, it updates that Router's request-local state.
 * Calls outside a Router use the legacy $location store.
 */
export function navigate(path: string, location = currentLocation()): void {
  const target = new URL(
    path,
    "http://vynn.local" + location.pathname + location.search,
  );
  const next = {
    pathname: target.pathname,
    search: target.search,
  };

  if (
    next.pathname === location.pathname &&
    next.search === location.search &&
    !target.hash
  ) {
    return;
  }

  if (!isServer) {
    history.pushState(null, "", target.pathname + target.search + target.hash);
    updateLocation(location, {
      pathname: window.location.pathname,
      search: window.location.search,
    });
    // Keep consumers of the old exported singleton working in browser apps.
    $location.pathname = window.location.pathname;
    $location.search = window.location.search;
    window.dispatchEvent(new Event("vynn:navigate"));
  } else {
    updateLocation(location, next);
  }
}
