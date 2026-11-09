import type { RouteParams } from "./types";

import { useRoutePath } from "./context";
import { currentLocation } from "./location";
import { getRouteParam } from "./path";

/**
 * Reactive, read-only parameters for the route component currently being
 * rendered. Each property read tracks the active Router's pathname.
 */
export const $params = new Proxy(Object.create(null) as RouteParams, {
  get(_target, key) {
    if (typeof key !== "string") {
      return undefined;
    }

    try {
      return getRouteParam(useRoutePath(), key, currentLocation());
    } catch {
      // Parameters are undefined outside a matched route component.
      return undefined;
    }
  },

  set() {
    throw new TypeError("Route parameters are read-only.");
  },

  deleteProperty() {
    throw new TypeError("Route parameters are read-only.");
  },

  defineProperty() {
    throw new TypeError("Route parameters are read-only.");
  },
});

/**
 * Reactive, read-only query parameters for the route component currently
 * being rendered. Each property read tracks the active Router's search string.
 */
export const $search = new Proxy(Object.create(null) as RouteParams, {
  get(_target, key) {
    if (typeof key !== "string") {
      return undefined;
    }

    try {
      // Require an active route context, just like $params.
      useRoutePath();

      const searchParams = new URLSearchParams(currentLocation().search);
      return searchParams.get(key) ?? undefined;
    } catch {
      // Search parameters are undefined outside a matched route component.
      return undefined;
    }
  },

  set() {
    throw new TypeError("Search parameters are read-only.");
  },

  deleteProperty() {
    throw new TypeError("Search parameters are read-only.");
  },

  defineProperty() {
    throw new TypeError("Search parameters are read-only.");
  },
});
