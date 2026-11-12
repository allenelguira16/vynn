import { $computed, $renderEffect, $state, onDestroy, runWithOwner, untrack } from "vynn";

import type { Location, Route } from "./types";

import { RoutePathProvider } from "./context";
import { currentLocation } from "./location";
import { getRouteParams, joinPaths, matchRoute, toSegments } from "./path";
import { commitClientRedirect, isClientRedirect } from "./redirect";
import { PATHLESS_ROUTE, REQUIRE_CHILD_MATCH, type InternalRoute } from "./route-meta";

type MatchedRoute<TContext = undefined> = {
  route: Route<TContext>;
  fullPath: string;
};

type RouteGuardResult =
  | { type: "allowed" }
  | { type: "redirect"; signal: unknown; revision: number };

/** Assigns a lexicographic specificity score to a route pattern. */
function getRouteSpecificity(path: string): number[] {
  return toSegments(path).map((segment) => {
    if (segment === "*" || segment === "*?") return 0;
    if (segment.startsWith(":")) return 1;
    return 2;
  });
}

function compareSpecificity(left: string, right: string): number {
  const a = getRouteSpecificity(left);
  const b = getRouteSpecificity(right);
  const length = Math.max(a.length, b.length);

  for (let index = 0; index < length; index++) {
    const difference = (a[index] ?? -1) - (b[index] ?? -1);
    if (difference !== 0) return difference;
  }

  return 0;
}

/** Finds the most specific URL path reachable inside a pathless route branch. */
function findPathlessMatchPath<TContext = undefined>(
  routes: Route<TContext>[],
  location: ReturnType<typeof currentLocation>,
  parentPath: string,
): string | undefined {
  let bestPath: string | undefined;

  for (const route of routes) {
    const internalRoute = route as InternalRoute<TContext>;
    const isPathless = internalRoute[PATHLESS_ROUTE] === true;
    const requiresChildMatch = internalRoute[REQUIRE_CHILD_MATCH] === true;
    const fullPath = isPathless ? parentPath : joinPaths(parentPath, route.path);
    const children = route.children ?? [];
    const hasChildren = children.length > 0;

    if (isPathless) {
      const nestedPath = findPathlessMatchPath(children, location, fullPath);
      if (nestedPath && (!bestPath || compareSpecificity(nestedPath, bestPath) > 0)) {
        bestPath = nestedPath;
      }
      continue;
    }

    if (!matchRoute(fullPath, !hasChildren, location)) continue;

    const nestedPath = hasChildren
      ? findPathlessMatchPath(children, location, fullPath)
      : undefined;
    if (requiresChildMatch && !nestedPath) continue;

    const candidatePath = nestedPath ?? fullPath;

    if (!bestPath || compareSpecificity(candidatePath, bestPath) > 0) {
      bestPath = candidatePath;
    }
  }

  return bestPath;
}

/** Returns whether a catch-all route matches without consuming a path segment. */
function isEmptyCatchAllMatch(path: string, pathname: string): boolean {
  const routeSegments = toSegments(path);
  return (
    routeSegments[routeSegments.length - 1] === "*?" &&
    toSegments(pathname).length === routeSegments.length - 1
  );
}

/** Finds the most specific route selected by the current outlet. */
export function findMatch<TContext = undefined>(
  routes: Route<TContext>[],
  location: ReturnType<typeof currentLocation>,
  parentPath = "",
): MatchedRoute<TContext> | undefined {
  let bestMatch: MatchedRoute<TContext> | undefined;
  let bestScorePath: string | undefined;

  for (const route of routes) {
    const internalRoute = route as InternalRoute<TContext>;
    const isPathless = internalRoute[PATHLESS_ROUTE] === true;
    const requiresChildMatch = internalRoute[REQUIRE_CHILD_MATCH] === true;
    const fullPath = isPathless ? parentPath : joinPaths(parentPath, route.path);
    const hasChildren = !!route.children?.length;

    if (isPathless || requiresChildMatch) {
      // A route group has no URL segment of its own. A folder with no page
      // must also resolve through a descendant so its layout does not create
      // a public route by itself.
      if (!isPathless && !matchRoute(fullPath, false, location)) {
        continue;
      }

      const descendantPath = findPathlessMatchPath(route.children ?? [], location, fullPath);
      if (!descendantPath) continue;

      const nextIsEmptyCatchAll = isEmptyCatchAllMatch(descendantPath, location.pathname);
      const bestIsEmptyCatchAll = bestScorePath
        ? isEmptyCatchAllMatch(bestScorePath, location.pathname)
        : false;

      if (bestScorePath && nextIsEmptyCatchAll !== bestIsEmptyCatchAll) {
        if (nextIsEmptyCatchAll) continue;
        bestMatch = { route, fullPath };
        bestScorePath = descendantPath;
        continue;
      }

      if (!bestScorePath || compareSpecificity(descendantPath, bestScorePath) > 0) {
        bestMatch = { route, fullPath };
        bestScorePath = descendantPath;
      }

      continue;
    }

    if (!matchRoute(fullPath, !hasChildren, location)) {
      continue;
    }

    if (bestMatch) {
      const nextIsEmptyCatchAll = isEmptyCatchAllMatch(fullPath, location.pathname);
      const bestIsEmptyCatchAll = bestScorePath
        ? isEmptyCatchAllMatch(bestScorePath, location.pathname)
        : isEmptyCatchAllMatch(bestMatch.fullPath, location.pathname);

      // A terminal wildcard may match without capturing any segments. In that
      // case it is only a fallback and must not shadow an exact route such as
      // "/" when visiting the home page.
      if (nextIsEmptyCatchAll !== bestIsEmptyCatchAll) {
        if (nextIsEmptyCatchAll) {
          continue;
        }

        bestMatch = { route, fullPath };
        bestScorePath = fullPath;
        continue;
      }
    }

    if (!bestScorePath || compareSpecificity(fullPath, bestScorePath) > 0) {
      bestMatch = { route, fullPath };
      bestScorePath = fullPath;
    }
  }
  return bestMatch;
}

/**
 * Runs the route guard once when its matched RouteView is created.
 *
 * The route component remains mounted when only its params or search string
 * change, so the guard uses the location snapshot from route entry and does
 * not revalidate for those in-place URL updates.
 */
function RouteView<TContext>(
  props: MatchedRoute<TContext> & {
    context: TContext;
    notFound?: Route<TContext>["component"];
  },
) {
  const RenderRoute = () => {
    const route = props.route;
    const fullPath = props.fullPath;
    const Component = route.component;
    const childRoutes = route.children ?? [];

    return (
      <Component>
        {!!childRoutes.length && (
          <RouteOutlet
            routes={childRoutes}
            parentPath={fullPath}
            context={props.context}
            notFound={props.notFound}
          />
        )}
      </Component>
    );
  };

  if (!props.route.beforeLoad) {
    return <RenderRoute />;
  }

  let guardRevision = 0;
  let activeGuardController: AbortController | undefined;

  // The route component owns the guard's lifetime. Disposing it aborts any
  // unfinished beforeLoad operation without reaching into Vynn's owner internals.
  onDestroy(() => activeGuardController?.abort());

  const allowed = $computed<RouteGuardResult>(
    async () => {
      const revision = ++guardRevision;

      // This resource represents the one-time guard for this RouteView.
      // Ensure any earlier invocation is no longer active if it is restarted.
      activeGuardController?.abort();

      const { route, fullPath } = untrack(() => ({
        route: props.route,
        fullPath: props.fullPath,
      }));

      // Capture the location from when this RouteView was created.
      // Later params or search changes must not rerun this route-entry check.
      const location: Location = untrack(() => {
        const activeLocation = currentLocation();

        return {
          pathname: activeLocation.pathname,
          search: activeLocation.search,
        };
      });

      const controller = new AbortController();
      activeGuardController = controller;

      try {
        // Keep the actual guard outside the async resource's initial synchronous
        // tracking pass, including when the user callback reads reactive state.
        await Promise.resolve();

        if (controller.signal.aborted) {
          return { type: "allowed" };
        }

        await untrack(() =>
          route.beforeLoad!({
            context: props.context,
            location,
            params: getRouteParams(fullPath, location),
            search: new URLSearchParams(location.search),
            signal: controller.signal,
          }),
        );

        return { type: "allowed" };
      } catch (error) {
        if (isClientRedirect(error)) {
          return {
            type: "redirect",
            signal: error,
            revision,
          };
        }

        throw error;
      }
    },
    { lazy: true },
  );

  let scheduledRedirect: unknown;

  const canRender = () => {
    // Read outside the ambient owner so an enclosing Await cannot claim this
    // router-level decision as part of its page fallback. The async resource
    // itself is still bound to this RouteView's owner.
    const result = runWithOwner(null, () => allowed.value);

    if (result.type === "redirect" && isClientRedirect(result.signal)) {
      if (scheduledRedirect !== result.signal) {
        scheduledRedirect = result.signal;

        commitClientRedirect(
          result.signal,
          () => guardRevision === result.revision && !activeGuardController?.signal.aborted,
          currentLocation(),
        );
      }

      return false;
    }

    scheduledRedirect = undefined;
    return result.type === "allowed";
  };

  return <>{canRender() && <RenderRoute />}</>;
}

/**
 * Renders one reactive routing level.
 *
 * Match changes are observed by a render effect, but the rendered subtree is
 * published only when the selected route changes. A params/search update must
 * not rerun this outlet's outer $nodes reconciliation: its cached DOM-node
 * array cannot include nodes later inserted by nested $nodes regions, and
 * reconciling that stale array would remove those live nested nodes.
 *
 * Descendant route content tracks pathname/search itself through $params and
 * $search. A RouteView's beforeLoad uses the location snapshot from its creation
 * and does not revalidate when those values change.
 */
export function RouteOutlet<TContext = undefined>(props: {
  routes: Route<TContext>[];
  parentPath?: string;
  context: TContext;
  notFound?: Route<TContext>["component"];
}) {
  let previousMatch: MatchedRoute<TContext> | undefined;
  let hasRendered = false;
  const view = $state<ReturnType<typeof RouteView> | null>(() => null);

  $renderEffect(() => {
    // Track the complete URL at the routing boundary. The effect only updates
    // the view state when the route identity or its resolved path changes.
    const activeLocation = currentLocation();
    const location: Location = {
      pathname: activeLocation.pathname,
      search: activeLocation.search,
    };
    const next = findMatch(props.routes, location, props.parentPath ?? "");

    if (
      hasRendered &&
      previousMatch?.route === next?.route &&
      previousMatch?.fullPath === next?.fullPath
    ) {
      return;
    }

    const nextView = next
      ? untrack(() => (
          <RoutePathProvider value={next.fullPath}>
            <RouteView
              route={next.route}
              fullPath={next.fullPath}
              context={props.context}
              notFound={props.notFound}
            />
          </RoutePathProvider>
        ))
      : props.notFound
        ? untrack(() => {
            const NotFound = props.notFound!;
            return <NotFound />;
          })
        : null;

    hasRendered = true;
    previousMatch = next;
    view.value = nextView;
  });

  return <>{view.value}</>;
}
