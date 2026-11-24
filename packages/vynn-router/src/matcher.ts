import type { Location, Route } from "./types";

import { joinPaths, matchRoute, normalizePath, toSegments } from "./path";
import { PATHLESS_ROUTE, REQUIRE_CHILD_MATCH, type InternalRoute } from "./route-meta";

export type CompiledRoute = {
  readonly route: Route<unknown>;
  readonly fullPath: string;
  readonly children: readonly CompiledRoute[];
  readonly pathSegments: readonly string[];
  readonly isPathless: boolean;
  readonly requiresChildMatch: boolean;
};

export type MatchedRoute<TContext = undefined> = {
  route: Route<TContext>;
  fullPath: string;
  node: CompiledRoute;
};

type MatchCandidate = {
  node: CompiledRoute;
  scorePath: string;
};

const compiledRouteTrees = new WeakMap<Route[], readonly CompiledRoute[]>();

function compileRoute(
  route: Route<unknown>,
  parentPath: string,
): CompiledRoute {
  const internalRoute = route as InternalRoute<unknown>;
  const isPathless = internalRoute[PATHLESS_ROUTE] === true;
  const fullPath = isPathless ? parentPath : joinPaths(parentPath, route.path);
  const children = (route.children ?? []).map((child) => compileRoute(child, fullPath));

  return {
    route,
    fullPath,
    children,
    pathSegments: toSegments(fullPath),
    isPathless,
    requiresChildMatch: internalRoute[REQUIRE_CHILD_MATCH] === true,
  };
}

/**
 * Compiles route definitions once. The same compiled tree is shared by
 * rendering, preloading, and matching for the lifetime of the route array.
 */
export function compileRoutes<TContext = undefined>(routes: Route<TContext>[]): readonly CompiledRoute[] {
  const key = routes as unknown as Route[];
  const cached = compiledRouteTrees.get(key);
  if (cached) return cached;

  const compiled = routes.map((route) => compileRoute(route as unknown as Route<unknown>, ""));
  compiledRouteTrees.set(key, compiled);
  return compiled;
}

function compareSpecificity(left: string, right: string): number {
  const a = toSegments(left);
  const b = toSegments(right);
  const length = Math.max(a.length, b.length);

  for (let index = 0; index < length; index++) {
    const leftSegment = a[index];
    const rightSegment = b[index];
    const leftRank = leftSegment === undefined ? -1 : leftSegment === "*" || leftSegment === "*?" ? 0 : leftSegment.startsWith(":") ? 1 : 2;
    const rightRank = rightSegment === undefined ? -1 : rightSegment === "*" || rightSegment === "*?" ? 0 : rightSegment.startsWith(":") ? 1 : 2;

    if (leftRank !== rightRank) return leftRank - rightRank;
  }

  return 0;
}

function isEmptyOptionalCatchAll(path: string, pathname: string): boolean {
  const segments = toSegments(path);
  return segments.at(-1) === "*?" && toSegments(pathname).length === segments.length - 1;
}

function isBetterCandidate(
  next: MatchCandidate,
  previous: MatchCandidate | undefined,
  location: Location,
): boolean {
  if (!previous) return true;

  const nextEmpty = isEmptyOptionalCatchAll(next.scorePath, location.pathname);
  const previousEmpty = isEmptyOptionalCatchAll(previous.scorePath, location.pathname);

  if (nextEmpty !== previousEmpty) return !nextEmpty;
  return compareSpecificity(next.scorePath, previous.scorePath) > 0;
}

function findBestDescendant(
  routes: readonly CompiledRoute[],
  location: Location,
): MatchCandidate | undefined {
  let best: MatchCandidate | undefined;

  for (const node of routes) {
    if (node.isPathless) {
      const descendant = findBestDescendant(node.children, location);
      if (descendant && isBetterCandidate(descendant, best, location)) {
        best = descendant;
      }
      continue;
    }

    const hasChildren = node.children.length > 0;
    if (!matchRoute(node.fullPath, !hasChildren, location)) continue;

    const descendant = hasChildren
      ? findBestDescendant(node.children, location)
      : undefined;

    if (node.requiresChildMatch && !descendant) continue;

    const candidate = {
      node,
      scorePath: descendant?.scorePath ?? node.fullPath,
    };

    if (isBetterCandidate(candidate, best, location)) {
      best = candidate;
    }
  }

  return best;
}

/** Finds the highest-specificity route at the current outlet level. */
export function findCompiledMatch<TContext = undefined>(
  routes: readonly CompiledRoute[],
  location: Location,
): MatchedRoute<TContext> | undefined {
  let best: MatchCandidate | undefined;

  for (const node of routes) {
    if (node.isPathless || node.requiresChildMatch) {
      if (!node.isPathless && !matchRoute(node.fullPath, false, location)) {
        continue;
      }

      const descendant = findBestDescendant(node.children, location);
      if (!descendant) continue;

      const candidate = {
        node,
        scorePath: descendant.scorePath,
      };

      if (isBetterCandidate(candidate, best, location)) {
        best = candidate;
      }

      continue;
    }

    const hasChildren = node.children.length > 0;
    if (!matchRoute(node.fullPath, !hasChildren, location)) continue;

    const descendant = hasChildren
      ? findBestDescendant(node.children, location)
      : undefined;

    const candidate = {
      node,
      scorePath: descendant?.scorePath ?? node.fullPath,
    };

    if (isBetterCandidate(candidate, best, location)) {
      best = candidate;
    }
  }

  if (!best) return undefined;

  return {
    route: best.node.route as Route<TContext>,
    fullPath: normalizePath(best.node.fullPath),
    node: best.node,
  };
}

/** Matches against an uncompiled route array for public/internal test compatibility. */
export function findMatch<TContext = undefined>(
  routes: Route<TContext>[],
  location: Location,
  parentPath = "",
): MatchedRoute<TContext> | undefined {
  const compiled = routes.map((route) => compileRoute(route as Route<unknown>, parentPath));
  return findCompiledMatch<TContext>(compiled, location);
}

export type { MatchCandidate };
