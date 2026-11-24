import type { Location, Route } from "./types";

import { joinPaths, normalizePath, toSegments } from "./path";
import { PATHLESS_ROUTE, REQUIRE_CHILD_MATCH, type InternalRoute } from "./route-meta";

type SegmentKind = "static" | "parameter" | "required-wildcard" | "optional-wildcard";

export type CompiledRoute = {
  readonly route: Route<unknown>;
  readonly fullPath: string;
  readonly children: readonly CompiledRoute[];
  readonly pathSegments: readonly string[];
  readonly segmentKinds: readonly SegmentKind[];
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
  scoreNode: CompiledRoute;
};

const compiledRouteTrees = new WeakMap<Route[], readonly CompiledRoute[]>();

function getSegmentKind(segment: string): SegmentKind {
  if (segment === "*") return "required-wildcard";
  if (segment === "*?") return "optional-wildcard";
  return segment.startsWith(":") ? "parameter" : "static";
}

function compileRoute(
  route: Route<unknown>,
  parentPath: string,
): CompiledRoute {
  const internalRoute = route as InternalRoute<unknown>;
  const isPathless = internalRoute[PATHLESS_ROUTE] === true;
  const fullPath = isPathless ? parentPath : joinPaths(parentPath, route.path);
  const pathSegments = toSegments(fullPath);
  const children = (route.children ?? []).map((child) =>
    compileRoute(child as unknown as Route<unknown>, fullPath),
  );

  return {
    route,
    fullPath,
    children,
    pathSegments,
    segmentKinds: pathSegments.map(getSegmentKind),
    isPathless,
    requiresChildMatch: internalRoute[REQUIRE_CHILD_MATCH] === true,
  };
}

/**
 * Compiles route definitions once. Matching and preloading share this tree,
 * avoiding repeated path normalization and route-pattern parsing on navigation.
 */
export function compileRoutes<TContext = undefined>(
  routes: Route<TContext>[],
): readonly CompiledRoute[] {
  const key = routes as unknown as Route[];
  const cached = compiledRouteTrees.get(key);
  if (cached) return cached;

  const compiled = routes.map((route) =>
    compileRoute(route as unknown as Route<unknown>, ""),
  );
  compiledRouteTrees.set(key, compiled);
  return compiled;
}

function matchesPath(
  route: CompiledRoute,
  pathnameSegments: readonly string[],
  exact: boolean,
): boolean {
  const pattern = route.pathSegments;
  const kinds = route.segmentKinds;
  const lastKind = kinds.at(-1);
  const hasWildcard =
    lastKind === "required-wildcard" || lastKind === "optional-wildcard";
  const requiresWildcardSegment = lastKind === "required-wildcard";
  const matchedSegmentCount = pattern.length - (hasWildcard ? 1 : 0);

  if (pathnameSegments.length < matchedSegmentCount) return false;
  if (requiresWildcardSegment && pathnameSegments.length === matchedSegmentCount) {
    return false;
  }

  if (exact && !hasWildcard && pathnameSegments.length !== matchedSegmentCount) {
    return false;
  }

  for (let index = 0; index < matchedSegmentCount; index++) {
    if (kinds[index] === "static" && pattern[index] !== pathnameSegments[index]) {
      return false;
    }
  }

  return true;
}

function isEmptyOptionalCatchAll(
  route: CompiledRoute,
  pathnameSegments: readonly string[],
): boolean {
  return (
    route.segmentKinds.at(-1) === "optional-wildcard" &&
    pathnameSegments.length === route.pathSegments.length - 1
  );
}

function compareSpecificity(left: CompiledRoute, right: CompiledRoute): number {
  const a = left.segmentKinds;
  const b = right.segmentKinds;
  const length = Math.max(a.length, b.length);

  const rank = (kind: SegmentKind | undefined): number => {
    if (kind === undefined) return -1;
    if (kind === "static") return 2;
    if (kind === "parameter") return 1;
    return 0;
  };

  for (let index = 0; index < length; index++) {
    const difference = rank(a[index]) - rank(b[index]);
    if (difference !== 0) return difference;
  }

  return 0;
}

function isBetterCandidate(
  next: MatchCandidate,
  previous: MatchCandidate | undefined,
  pathnameSegments: readonly string[],
): boolean {
  if (!previous) return true;

  const nextEmpty = isEmptyOptionalCatchAll(next.scoreNode, pathnameSegments);
  const previousEmpty = isEmptyOptionalCatchAll(previous.scoreNode, pathnameSegments);

  if (nextEmpty !== previousEmpty) return !nextEmpty;
  return compareSpecificity(next.scoreNode, previous.scoreNode) > 0;
}

function findBestDescendant(
  routes: readonly CompiledRoute[],
  pathnameSegments: readonly string[],
): MatchCandidate | undefined {
  let best: MatchCandidate | undefined;

  for (const node of routes) {
    if (node.isPathless) {
      const descendant = findBestDescendant(node.children, pathnameSegments);
      if (descendant && isBetterCandidate(descendant, best, pathnameSegments)) {
        best = descendant;
      }
      continue;
    }

    const hasChildren = node.children.length > 0;
    if (!matchesPath(node, pathnameSegments, !hasChildren)) continue;

    const descendant = hasChildren
      ? findBestDescendant(node.children, pathnameSegments)
      : undefined;

    if (node.requiresChildMatch && !descendant) continue;

    const candidate = {
      node,
      scoreNode: descendant?.scoreNode ?? node,
    };

    if (isBetterCandidate(candidate, best, pathnameSegments)) {
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
  const pathnameSegments = toSegments(location.pathname);
  let best: MatchCandidate | undefined;

  for (const node of routes) {
    if (node.isPathless || node.requiresChildMatch) {
      if (!node.isPathless && !matchesPath(node, pathnameSegments, false)) {
        continue;
      }

      const descendant = findBestDescendant(node.children, pathnameSegments);
      if (!descendant) continue;

      const candidate = {
        node,
        scoreNode: descendant.scoreNode,
      };

      if (isBetterCandidate(candidate, best, pathnameSegments)) {
        best = candidate;
      }

      continue;
    }

    const hasChildren = node.children.length > 0;
    if (!matchesPath(node, pathnameSegments, !hasChildren)) continue;

    const descendant = hasChildren
      ? findBestDescendant(node.children, pathnameSegments)
      : undefined;

    const candidate = {
      node,
      scoreNode: node,
    };

    if (isBetterCandidate(candidate, best, pathnameSegments)) {
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

/** Matches an uncompiled route array, primarily for direct matcher consumers. */
export function findMatch<TContext = undefined>(
  routes: Route<TContext>[],
  location: Location,
  parentPath = "",
): MatchedRoute<TContext> | undefined {
  const compiled = routes.map((route) =>
    compileRoute(route as unknown as Route<unknown>, parentPath),
  );
  return findCompiledMatch<TContext>(compiled, location);
}
