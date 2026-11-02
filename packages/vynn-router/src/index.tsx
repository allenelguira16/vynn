import type { FC, PropsWithChildren } from "vynn";

import { $computed, $store, createContext, onMount } from "vynn";

export type Route = {
  path: string;
  component: FC<PropsWithChildren>;
  children?: Route[];
};

export type Location = {
  pathname: string;
  search: string;
};

export type RouteParams = Readonly<Record<string, string | undefined>>;

type MatchedRoute = {
  route: Route;
  fullPath: string;
};

const isServer = typeof window === "undefined";

/**
 * Legacy/default location store. The router uses a per-Router store in context
 * so multiple concurrent SSR requests never mutate one module-level location.
 */
export const $location = $store<Location>({
  pathname: !isServer ? window.location.pathname : "/",
  search: !isServer ? window.location.search : "",
});

const [LocationProvider, useRouterLocation] = createContext<Location>();
const [RoutePathProvider, useRoutePath] = createContext<string>();

if (!isServer) {
  window.addEventListener("popstate", () => {
    $location.pathname = window.location.pathname;
    $location.search = window.location.search;
  });
}

function currentLocation(): Location {
  try {
    return useRouterLocation();
  } catch {
    // Public helpers can also be used outside a Router. Keep the original
    // module-level location store as a compatibility fallback for those callers.
    return $location;
  }
}

/**
 * Normalizes a pathname by collapsing repeated slashes and removing a
 * trailing slash. The root path is always represented as `/`.
 */
function normalizePath(path: string): string {
  if (!path || path === "/") return "/";
  const normalized = path.replace(/\/+/g, "/").replace(/\/$/, "");
  return normalized || "/";
}

/** Splits a pathname into its non-empty segments. */
function toSegments(path: string): string[] {
  return normalizePath(path).split("/").filter(Boolean);
}

/**
 * Reads one parameter from a route pattern.
 *
 * Parent route patterns are prefixes of their nested routes, so matching does
 * not require the pathname and route pattern to have the same number of
 * segments.
 */
function getRouteParam(path: string, name: string, location: Location): string | undefined {
  const routeSegments = toSegments(path);
  const pathnameSegments = toSegments(location.pathname);

  if (pathnameSegments.length < routeSegments.length) {
    return undefined;
  }

  let value: string | undefined;

  for (let index = 0; index < routeSegments.length; index++) {
    const routeSegment = routeSegments[index];
    const pathnameSegment = pathnameSegments[index];

    if (routeSegment.startsWith(":")) {
      if (routeSegment.slice(1) === name) {
        try {
          value = decodeURIComponent(pathnameSegment);
        } catch {
          value = pathnameSegment;
        }
      }
    } else if (routeSegment !== pathnameSegment) {
      return undefined;
    }
  }

  return value;
}

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

function parseLocation(url?: string): Location {
  const fallback = !isServer ? `${window.location.pathname}${window.location.search}` : "/";
  const parsed = new URL(url || fallback, "http://vynn.local");
  return {
    pathname: parsed.pathname,
    search: parsed.search,
  };
}

function updateLocation(target: Location, next: Location): void {
  target.pathname = next.pathname;
  target.search = next.search;
}

/**
 * Updates the current URL and reactive location state.
 *
 * When called within a Router, it updates that Router's request-local state.
 * Calls outside a Router use the legacy `$location` store.
 */
export function navigate(path: string, location = currentLocation()): void {
  const target = new URL(path, `http://vynn.local${location.pathname}${location.search}`);
  const next = {
    pathname: target.pathname,
    search: target.search,
  };

  if (next.pathname === location.pathname && next.search === location.search && !target.hash) {
    return;
  }

  if (!isServer) {
    history.pushState(null, "", `${target.pathname}${target.search}${target.hash}`);
    updateLocation(location, {
      pathname: window.location.pathname,
      search: window.location.search,
    });
    // Keep consumers of the old exported singleton working in browser apps.
    $location.pathname = window.location.pathname;
    $location.search = window.location.search;
  } else {
    updateLocation(location, next);
  }
}

/** Checks whether the supplied pathname matches the current pathname. */
function matchRoute(targetPath: string, exact = true, location = currentLocation()): boolean {
  const pathname = normalizePath(location.pathname);
  const target = normalizePath(targetPath);
  const pathnameSegments = toSegments(pathname);
  const targetSegments = toSegments(target);

  if (target === "/") return exact ? pathname === "/" : true;
  if (exact && pathnameSegments.length !== targetSegments.length) return false;
  if (!exact && pathnameSegments.length < targetSegments.length) return false;

  return targetSegments.every(
    (segment, index) => segment.startsWith(":") || segment === pathnameSegments[index],
  );
}

/** Combines a parent route path with a child route path. */
function joinPaths(parent: string, child: string): string {
  const normalizedParent = normalizePath(parent);
  if (normalizedParent === "/") return normalizePath(child);
  if (!child || child === "/") return normalizedParent;
  return normalizePath(`${normalizedParent}/${child}`);
}

/** Finds the route selected by the current outlet. */
function findMatch(routes: Route[], parentPath = ""): MatchedRoute | undefined {
  const location = currentLocation();

  for (const route of routes) {
    const fullPath = joinPaths(parentPath, route.path);
    const hasChildren = !!route.children?.length;

    if (matchRoute(fullPath, !hasChildren, location)) {
      return { route, fullPath };
    }
  }

  return undefined;
}

/** Renders one reactive routing level. Child routes use nested outlets. */
function RouteOutlet(props: { routes: Route[]; parentPath?: string }) {
  let previousMatch: MatchedRoute | undefined;
  let previousView: ReturnType<Route["component"]> | null = null;

  const view = $computed(() => {
    const next = findMatch(props.routes, props.parentPath ?? "");

    // Keep the existing component tree when this outlet's route is unchanged.
    if (previousMatch?.route === next?.route && previousMatch?.fullPath === next?.fullPath) {
      return previousView;
    }

    let nextView: ReturnType<Route["component"]> | null = null;

    if (next) {
      const { route, fullPath } = next;
      const childRoutes = route.children ?? [];

      const Component = route.component;
      nextView = (
        <RoutePathProvider value={fullPath}>
          <Component>
            {!!childRoutes.length && (
              <RouteOutlet routes={childRoutes} parentPath={fullPath} />
            )}
          </Component>
        </RoutePathProvider>
      );
    }

    // Cache both the match and its rendered component tree.
    previousMatch = next;
    previousView = nextView;

    return nextView;
  });

  return <>{view.value}</>;
}

/** Creates a Router with request-local URL state, suitable for SSR. */
export function Router(props: { url?: string; routes: Route[] }) {
  const location = $store<Location>(parseLocation(props.url));

  if (!isServer) {
    // Keep legacy consumers synchronized, but never mutate the module-level
    // singleton on the server: separate requests have separate Router stores.
    updateLocation($location, location);
    onMount(() => {
      const updateFromBrowser = () => {
        updateLocation(location, {
          pathname: window.location.pathname,
          search: window.location.search,
        });
        updateLocation($location, location);
      };
      window.addEventListener("popstate", updateFromBrowser);
      return () => window.removeEventListener("popstate", updateFromBrowser);
    });
  }

  return (
    <LocationProvider value={location}>
      <RouteOutlet routes={props.routes} />
    </LocationProvider>
  );
}

/** Checks whether a path matches the current pathname. */
export function isActiveRoute(targetPath: string, location = currentLocation()): boolean {
  const pathname = normalizePath(location.pathname);
  const target = normalizePath(targetPath);
  const pathnameSegments = toSegments(pathname);
  const targetSegments = toSegments(target);

  if (target === "/") return pathname === "/";
  if (pathnameSegments.length !== targetSegments.length) return false;

  return targetSegments.every(
    (segment, index) => segment.startsWith(":") || segment === pathnameSegments[index],
  );
}

/** Renders an anchor that navigates through the active Router. */
export function Link(
  props: PropsWithChildren<{
    href: string;
    activeClass?: string;
    class?: string;
  }>,
) {
  props.class ??= "";
  const location = currentLocation();

  return (
    <a
      href={props.href}
      class={(
        props.class + (isActiveRoute(props.href, location) ? ` ${props.activeClass ?? ""}` : "")
      ).trim()}
      onClick={(event) => {
        if (!isServer) {
          event.preventDefault();
          event.stopPropagation();
          navigate(props.href, location);
        }
      }}
    >
      {props.children}
    </a>
  );
}
