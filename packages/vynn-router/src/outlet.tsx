import { $async, $computed, untrack } from "vynn";
import { readRouteGuard } from "vynn/internal/router";

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

  const allowed = $async<RouteGuardResult>(async () => {
    const revision = ++guardRevision;
    const route = props.route;
    const fullPath = props.fullPath;
    const activeLocation = currentLocation();

    const location: Location = untrack(() => ({
      pathname: activeLocation.pathname,
      search: activeLocation.search,
    }));

    try {
      // $async re-executes its getter with inert Promise/fetch APIs when it
      // hydrates serialized data. Yield first so that tracking-only pass
      // establishes location dependencies without invoking user guard code.
      await Promise.resolve();

      await route.beforeLoad!({
        location,
        params: getRouteParams(fullPath, location),
        search: new URLSearchParams(location.search),
      });

      return { type: "allowed" };
    } catch (error) {
      // Return the signal as data. $async discards stale executions, so an
      // outdated guard cannot redirect after a newer navigation has started.
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

        commitClientRedirect(result.signal, () => guardRevision === result.revision);
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
  let previousView: ReturnType<typeof RouteView> | null = null;

  const view = $computed(() => {
    const next = findMatch(props.routes, currentLocation(), props.parentPath ?? "");

    if (previousMatch?.route === next?.route && previousMatch?.fullPath === next?.fullPath) {
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
    previousView = nextView;

    return nextView;
  });

  return <>{view.value}</>;
}
