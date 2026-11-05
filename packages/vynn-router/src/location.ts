import { $store } from "vynn";
import { batchRouterLocation } from "vynn/internal/router";

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

let activeLocation: Location | undefined;

if (!isServer) {
  window.addEventListener("popstate", () => {
    batchRouterLocation(() => {
      updateLocation($location, {
        pathname: window.location.pathname,
        search: window.location.search,
      });
    });
  });
}

/**
 * Sets the browser Router location used by callbacks that resume after an
 * await, when the synchronous component context is no longer active.
 */
export function setActiveLocation(location: Location): void {
  activeLocation = location;
}

export function currentLocation(): Location {
  try {
    return useRouterLocation();
  } catch {
    // Async callbacks resume without a Vynn owner. In the browser, use the
    // active Router store so redirects still update the Router's own location.
    return activeLocation ?? $location;
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

/**
 * Updates pathname and search atomically so reactive consumers observe one
 * navigation rather than an intermediate half-updated location.
 */
export function updateLocation(target: Location, next: Location): void {
  batchRouterLocation(() => {
    target.pathname = next.pathname;
    target.search = next.search;
  });
}

function updateUrl(
  path: string,
  location: Location,
  historyAction: "push" | "replace",
): void {
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
    const url = target.pathname + target.search + target.hash;

    if (historyAction === "replace") {
      history.replaceState(null, "", url);
    } else {
      history.pushState(null, "", url);
    }

    const current = {
      pathname: window.location.pathname,
      search: window.location.search,
    };

    // Keep the Router-scoped and legacy location stores in the same commit.
    batchRouterLocation(() => {
      updateLocation(location, current);
      updateLocation($location, current);
    });
  } else {
    updateLocation(location, next);
  }
}

/**
 * Updates the current URL and reactive location state by pushing a history
 * entry. Calls outside a Router use the active browser location or $location.
 */
export function navigate(path: string, location = currentLocation()): void {
  updateUrl(path, location, "push");
}

/** Replaces the current URL and history entry without adding a back-button stop. */
export function replace(path: string, location = currentLocation()): void {
  updateUrl(path, location, "replace");
}
