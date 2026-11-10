import { $store } from "vynn";

import type { Location } from "./types";

import { useRouterLocation } from "./context";
import { isServer } from "./environment";

/**
 * Fallback location store for consumers outside a Router. Each Router has its
 * own store so route state remains scoped to that Router and concurrent SSR
 * renders never share request-specific state.
 */
const defaultLocation = $store<Location>({
  pathname: !isServer ? window.location.pathname : "/",
  search: !isServer ? window.location.search : "",
});

/**
 * Reactive location facade. Inside a Router it reads and writes that Router's
 * request-local store; outside a Router it uses the browser/default store.
 */
export const $location = new Proxy(defaultLocation, {
  get(target, property) {
    let location: Location;

    try {
      location = useRouterLocation();
    } catch {
      location = target;
    }

    return Reflect.get(location, property, location);
  },

  set(target, property, value) {
    let location: Location;

    try {
      location = useRouterLocation();
    } catch {
      location = target;
    }

    return Reflect.set(location, property, value, location);
  },
});

if (!isServer) {
  window.addEventListener("popstate", () => {
    updateDefaultLocation({
      pathname: window.location.pathname,
      search: window.location.search,
    });
  });
}

/**
 * Returns the current router location when called inside a route owner.
 * Async callbacks without an owner use the browser-level fallback store;
 * callers working with independent router instances can pass their location
 * explicitly to navigate() or replace().
 */
export function currentLocation(): Location {
  try {
    return useRouterLocation();
  } catch {
    return $location;
  }
}

/** Parses a URL into the location shape used by the router. */
export function parseLocation(url?: string): Location {
  const fallback = !isServer ? window.location.pathname + window.location.search : "/";
  const base = !isServer ? window.location.origin : "http://vynn.local";
  const parsed = new URL(url || fallback, base);

  return {
    pathname: parsed.pathname,
    search: parsed.search,
  };
}

/** Updates a location store from a parsed URL. */
export function updateLocation(target: Location, next: Location): void {
  if (target.pathname !== next.pathname) {
    target.pathname = next.pathname;
  }

  if (target.search !== next.search) {
    target.search = next.search;
  }
}

/** Synchronizes the fallback store without resolving the Router context. */
export function updateDefaultLocation(next: Location): void {
  updateLocation(defaultLocation, next);
}

function updateUrl(path: string, location: Location, historyAction: "push" | "replace"): void {
  const base = !isServer
    ? window.location.origin + location.pathname + location.search
    : "http://vynn.local" + location.pathname + location.search;
  const target = new URL(path, base);

  if (!isServer && target.origin !== window.location.origin) {
    window.location.assign(target.href);
    return;
  }

  const next = {
    pathname: target.pathname,
    search: target.search,
  };

  const currentHash = isServer ? "" : window.location.hash;
  if (
    next.pathname === location.pathname &&
    next.search === location.search &&
    target.hash === currentHash
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

    // Keep both the active Router and fallback location up to date.
    updateLocation(location, current);
    updateDefaultLocation(current);

    // pushState/replaceState do not perform native fragment scrolling.
    // Route updates commit synchronously, so the target can be resolved here.
    if (target.hash) {
      let id = target.hash.slice(1);
      try {
        id = decodeURIComponent(id);
      } catch {
        // Keep the literal fragment when it contains malformed escapes.
      }

      const targetElement = document.getElementById(id) ?? document.getElementsByName(id).item(0);
      if (targetElement && typeof targetElement.scrollIntoView === "function") {
        targetElement.scrollIntoView();
      }
    }
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
