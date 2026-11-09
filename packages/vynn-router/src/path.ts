import type { Location, RouteParams } from "./types";

/**
 * Normalizes a pathname by collapsing repeated slashes and removing a
 * trailing slash. The root path is always represented as "/".
 */
export function normalizePath(path: string): string {
  if (!path || path === "/") return "/";
  const normalized = path.replace(/\/+/g, "/").replace(/\/$/, "");
  return normalized || "/";
}

/** Splits a pathname into its non-empty segments. */
export function toSegments(path: string): string[] {
  return normalizePath(path).split("/").filter(Boolean);
}

/** Returns whether a route pattern ends with a catch-all segment. */
export function isCatchAllPath(path: string): boolean {
  const segments = toSegments(path);
  return segments[segments.length - 1] === "*";
}

/** Decodes a path segment without failing on malformed percent escapes. */
function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** Reads one parameter from a route pattern. */
export function getRouteParam(
  path: string,
  name: string,
  location: Location,
): string | undefined {
  const routeSegments = toSegments(path);
  const pathnameSegments = toSegments(location.pathname);
  const hasWildcard = isCatchAllPath(path);
  const matchedSegmentCount = routeSegments.length - (hasWildcard ? 1 : 0);

  if (pathnameSegments.length < matchedSegmentCount) {
    return undefined;
  }

  let value: string | undefined;

  for (let index = 0; index < matchedSegmentCount; index++) {
    const routeSegment = routeSegments[index];
    const pathnameSegment = pathnameSegments[index];

    if (routeSegment.startsWith(":")) {
      if (routeSegment.slice(1) === name) {
        value = decodePathSegment(pathnameSegment);
      }
    } else if (routeSegment !== pathnameSegment) {
      return undefined;
    }
  }

  if (name === "*" && hasWildcard) {
    return pathnameSegments
      .slice(matchedSegmentCount)
      .map(decodePathSegment)
      .join("/");
  }

  return value;
}

/** Reads all dynamic and catch-all parameters captured by a route pattern. */
export function getRouteParams(path: string, location: Location): RouteParams {
  const routeSegments = toSegments(path);
  const pathnameSegments = toSegments(location.pathname);
  const hasWildcard = isCatchAllPath(path);
  const matchedSegmentCount = routeSegments.length - (hasWildcard ? 1 : 0);
  const params: Record<string, string | undefined> = {};

  if (pathnameSegments.length < matchedSegmentCount) {
    return params;
  }

  for (let index = 0; index < matchedSegmentCount; index++) {
    const routeSegment = routeSegments[index];

    if (!routeSegment.startsWith(":")) {
      continue;
    }

    params[routeSegment.slice(1)] = decodePathSegment(pathnameSegments[index]);
  }

  if (hasWildcard) {
    params["*"] = pathnameSegments
      .slice(matchedSegmentCount)
      .map(decodePathSegment)
      .join("/");
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

  const hasWildcard = targetSegments[targetSegments.length - 1] === "*";
  const matchedSegmentCount = targetSegments.length - (hasWildcard ? 1 : 0);

  if (pathnameSegments.length < matchedSegmentCount) return false;
  if (exact && !hasWildcard && pathnameSegments.length !== matchedSegmentCount) {
    return false;
  }

  return targetSegments.slice(0, matchedSegmentCount).every(
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
