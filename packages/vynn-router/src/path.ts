import type { Location, RouteParams } from "./types";

/**
 * Normalizes a pathname by collapsing repeated slashes and removing a
 * trailing slash. The root path is always represented as "/".
 */
export function normalizePath(path: string): string {
  if (!path || path === "/") return "/";
  const normalized = path.replace(/\\/+/g, "/").replace(/\\/$/, "");
  return normalized || "/";
}

/** Splits a pathname into its non-empty segments. */
export function toSegments(path: string): string[] {
  return normalizePath(path).split("/").filter(Boolean);
}

/**
 * Reads one parameter from a route pattern.
 *
 * Parent route patterns are prefixes of their nested routes, so matching does
 * not require the pathname and route pattern to have the same number of
 * segments.
 */
export function getRouteParam(
  path: string,
  name: string,
  location: Location,
): string | undefined {
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

/** Reads all dynamic parameters captured by a route pattern. */
export function getRouteParams(path: string, location: Location): RouteParams {
  const routeSegments = toSegments(path);
  const pathnameSegments = toSegments(location.pathname);
  const params: Record<string, string | undefined> = {};

  if (pathnameSegments.length < routeSegments.length) {
    return params;
  }

  for (let index = 0; index < routeSegments.length; index++) {
    const routeSegment = routeSegments[index];

    if (!routeSegment.startsWith(":")) {
      continue;
    }

    try {
      params[routeSegment.slice(1)] = decodeURIComponent(pathnameSegments[index]);
    } catch {
      params[routeSegment.slice(1)] = pathnameSegments[index];
    }
  }

  return params;
}

/** Checks whether the supplied pathname matches the current pathname. */
export function matchRoute(
  targetPath: string,
  exact: boolean,
  location: Location,
): boolean {
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
export function joinPaths(parent: string, child: string): string {
  const normalizedParent = normalizePath(parent);
  if (normalizedParent === "/") return normalizePath(child);
  if (!child || child === "/") return normalizedParent;
  return normalizePath(normalizedParent + "/" + child);
}
