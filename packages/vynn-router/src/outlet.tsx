import { $computed } from "vynn";

import { RoutePathProvider } from "./context";
import { currentLocation } from "./location";
import { joinPaths, matchRoute } from "./path";
import type { Route } from "./types";

type MatchedRoute = {
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

/** Renders one reactive routing level. Child routes use nested outlets. */
export function RouteOutlet(props: { routes: Route[]; parentPath?: string }) {
  let previousMatch: MatchedRoute | undefined;
  let previousView: ReturnType<Route["component"]> | null = null;

  const view = $computed(() => {
    const next = findMatch(
      props.routes,
      currentLocation(),
      props.parentPath ?? "",
    );

    // Keep the existing component tree when this outlet's route is unchanged.
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
