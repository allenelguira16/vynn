import { $computed, $renderEffect, $state, onDestroy, runWithOwner, untrack } from "vynn";

import type { Location, Route } from "./types";

import { RoutePathProvider } from "./context";
import { isServer } from "./environment";
import { currentLocation } from "./location";
import { getRouteParams, isCatchAllPath, joinPaths, matchRoute, toSegments } from "./path";
import { commitClientRedirect, isClientRedirect } from "./redirect";

type NotReadyErrorLike = Error & {
  promise: Promise<unknown>;
  blocking: boolean;
};

function isNotReadyError(error: unknown): error is NotReadyErrorLike {
  return (
    error instanceof Error &&
    error.name === "NotReadyError" &&
    "promise" in error &&
    "blocking" in error
  );
}

type MatchedRoute = {
  route: Route;
  fullPath: string;
};

type RouteGuardResult =
  | { type: "allowed" }
  | { type: "redirect"; signal: unknown; revision: number };

/** Assigns a lexicographic specificity score to a route pattern. */
function getRouteSpecificity(path: string): number[] {
  return toSegments(path).map((segment) => {
    if (segment === "*") return 0;
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

/** Finds the most specific route selected by the current outlet. */
export function findMatch(
  routes: Route[],
  location: ReturnType<typeof currentLocation>,
  parentPath = "",
): MatchedRoute | undefined {
  let bestMatch: MatchedRoute | undefined;

  for (const route of routes) {
    const fullPath = joinPaths(parentPath, route.path);
    const hasChildren = !!route.children?.length;

    if (!matchRoute(fullPath, !hasChildren, location)) {
      continue;
    }

    if (
      !bestMatch ||
      compareSpecificity(fullPath, bestMatch.fullPath) > 0
    ) {
      bestMatch = { route, fullPath };
    }
  }

  return bestMatch;
}

/**
 * Evaluates the route guard as a reactive async resource.
 *
 * The route component remains mounted when only its params or search string
 * change. The guard resource tracks the location and revalidates in place.
 */
function RouteView(props: MatchedRoute) {
  const RenderRoute = () => {
    const route = props.route;
    const fullPath = props.fullPath;
    const Component = route.component;
    const childRoutes = route.children ?? [];

    return (
      <Component>
        {!!childRoutes.length && <RouteOutlet routes={childRoutes} parentPath={fullPath} />}
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

      // A location change reruns this resource instead of replacing RouteView.
      // Abort the previous navigation before starting the next guard.
      activeGuardController?.abort();

      const { route, fullPath } = untrack(() => ({
        route: props.route,
        fullPath: props.fullPath,
      }));

      // Snapshot the location without subscribing the guard resource to it.
      // beforeLoad is a one-shot check for this navigation, not a reactive effect.
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
    let result: RouteGuardResult;

    try {
      result = runWithOwner(null, () => allowed.value);
    } catch (error) {
      // A pending route guard must settle before the server commits the
      // response. Keep this blocking behavior in the router rather than
      // applying it to every lazy async computed value.
      if (isServer && isNotReadyError(error)) {
        error.blocking = true;
        throw error;
      }

      // The blocking SSR deferred node already awaits this guard promise.
      // Suppress the resource settlement effect's duplicate Response throw;
      // the deferred node will propagate it to the request handler.
      if (isServer && error instanceof Response) return false;
      throw error;
    }

    if (result.type === "redirect" && isClientRedirect(result.signal)) {
      if (scheduledRedirect !== result.signal) {
        scheduledRedirect = result.signal;

        commitClientRedirect(
          result.signal,
          () => guardRevision === result.revision && !activeGuardController?.signal.aborted,
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
 * $search, while RouteView's beforeLoad resource tracks location separately.
 */
export function RouteOutlet(props: { routes: Route[]; parentPath?: string }) {
  let previousMatch: MatchedRoute | undefined;
  const view = $state<ReturnType<typeof RouteView> | null>(null);

  $renderEffect(() => {
    // Track the complete URL at the routing boundary. The effect only updates
    // the view state when the route identity or its resolved path changes.
    const activeLocation = currentLocation();
    const location: Location = {
      pathname: activeLocation.pathname,
      search: activeLocation.search,
    };
    const next = findMatch(props.routes, location, props.parentPath ?? "");

    if (previousMatch?.route === next?.route && previousMatch?.fullPath === next?.fullPath) {
      return;
    }

    const nextView = next
      ? untrack(() => (
          <RoutePathProvider value={next.fullPath}>
            <RouteView route={next.route} fullPath={next.fullPath} />
          </RoutePathProvider>
        ))
      : null;

    previousMatch = next;
    view.value = nextView;
  });

  return <>{view.value}</>;
}
