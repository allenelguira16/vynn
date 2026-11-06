import { $async, $computed, untrack } from "vynn";
import { readRouteGuard, registerRouterCleanup } from "vynn/internal/router";

import type { Location, Route } from "./types";

import { RoutePathProvider } from "./context";
import { currentLocation } from "./location";
import { getRouteParams, joinPaths, matchRoute } from "./path";
import { commitClientRedirect, isClientRedirect } from "./redirect";

type MatchedRoute = {
  route: Route;
  fullPath: string;
};

type RouteGuardResult =
  | { type: "allowed" }
  | { type: "redirect"; signal: unknown; revision: number };

/** Finds the route selected by the current outlet. */
function findMatch(
  routes: Route[],
  location: ReturnType<typeof currentLocation>,
  parentPath = "",
): MatchedRoute | undefined {
  for (const route of routes) {
    const fullPath = joinPaths(parentPath, route.path);
    const hasChildren = !!route.children?.length;

    if (matchRoute(fullPath, !hasChildren, location)) {
      return { route, fullPath };
    }
  }

  return undefined;
}

/**
 * Evaluates the route guard as a reactive async resource.
 *
 * The route component remains behind a normal JSX conditional, allowing
 * Vynn's compiler/runtime to mount and dispose only the affected subtree.
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

  // The route owner owns the active guard just as it owns the rendered route.
  // Disposing the route must not leave an async guard running in the background.
  registerRouterCleanup(() => activeGuardController?.abort());

  const allowed = $async<RouteGuardResult>(async () => {
    const revision = ++guardRevision;
    const { route, fullPath } = untrack(() => ({
      route: props.route,
      fullPath: props.fullPath,
    }));

    // This resource is intentionally one-shot. The outlet creates a fresh
    // RouteView for each location change; this getter must not subscribe to
    // navigation state or to dependencies read by the user's guard.
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
  });

  let scheduledRedirect: unknown;

  const canRender = () => {
    const result = readRouteGuard(() => allowed.value);

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
 * Renders one reactive routing level. Keep the computed view inside the
 * JSX fragment so the normal dynamic-node hydration path owns route switches.
 */
export function RouteOutlet(props: { routes: Route[]; parentPath?: string }) {
  let previousMatch: MatchedRoute | undefined;
  let previousLocation: Location | undefined;
  let previousView: ReturnType<typeof RouteView> | null = null;

  const view = $computed(() => {
    // Track the complete URL here, at the routing boundary. A location change
    // creates a new guard owner instead of rerunning the old $async resource.
    const activeLocation = currentLocation();
    const location: Location = {
      pathname: activeLocation.pathname,
      search: activeLocation.search,
    };
    const next = findMatch(props.routes, location, props.parentPath ?? "");
    const sameLocation =
      previousLocation?.pathname === location.pathname &&
      previousLocation?.search === location.search;

    if (
      previousMatch?.route === next?.route &&
      previousMatch?.fullPath === next?.fullPath &&
      (sameLocation || !next?.route.beforeLoad)
    ) {
      previousLocation = location;
      return previousView;
    }

    let nextView: ReturnType<typeof RouteView> | null = null;

    if (next) {
      const { route, fullPath } = next;

      nextView = (
        <RoutePathProvider value={fullPath}>
          <RouteView route={route} fullPath={fullPath} />
        </RoutePathProvider>
      );
    }

    previousMatch = next;
    previousLocation = location;
    previousView = nextView;

    return nextView;
  });

  return <>{view.value}</>;
}
