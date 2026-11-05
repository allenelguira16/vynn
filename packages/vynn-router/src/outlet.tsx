import { $nodes } from "vynn/render";

import { RoutePathProvider } from "./context";
import { RouteLoadBoundary } from "./route-load";
import { currentLocation } from "./location";
import { joinPaths, matchRoute } from "./path";
import type { Route } from "./types";

export type MatchedRoute = {
  route: Route;
  fullPath: string;
};

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
 * Renders one reactive routing level. Each outlet owns its own render range
 * so nested outlets continue observing location changes even when their
 * parent evaluates children inside an untracked boundary such as Await.
 */
export function RouteOutlet(props: { routes: Route[]; parentPath?: string }) {
  let previousMatch: MatchedRoute | undefined;
  let previousView: ReturnType<Route["component"]> | null = null;

  return $nodes(() => {
    const next = findMatch(
      props.routes,
      currentLocation(),
      props.parentPath ?? "",
    );

    // Keep the existing component tree when this outlet's route is unchanged.
    // Search-param changes are handled by the components that read $search.
    if (
      previousMatch?.route === next?.route &&
      previousMatch?.fullPath === next?.fullPath
    ) {
      return previousView;
    }

    let nextView: ReturnType<Route["component"]> | null = null;

    if (next) {
      const { route, fullPath } = next;
      const childRoutes = route.children ?? [];
      const Component = route.component;

      // Do not invoke Component or create its child outlet until the guard
      // succeeds. Vynn components execute eagerly when their JSX expression
      // is evaluated, so the renderer must be passed as a callback.
      const renderRoute = () => (
        <Component>
          {!!childRoutes.length && (
            <RouteOutlet routes={childRoutes} parentPath={fullPath} />
          )}
        </Component>
      );

      nextView = (
        <RoutePathProvider value={fullPath}>
          {route.beforeLoad ? (
            <RouteLoadBoundary
              beforeLoad={route.beforeLoad}
              render={renderRoute}
            />
          ) : (
            renderRoute()
          )}
        </RoutePathProvider>
      );
    }

    // Cache the matched route and its component tree. The enclosing $nodes
    // effect reruns this callback whenever this outlet's location changes.
    previousMatch = next;
    previousView = nextView;

    return nextView;
  });
}
