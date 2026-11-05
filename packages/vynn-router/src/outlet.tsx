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

type RouteViewProps = {
  route: Route;
  fullPath: string;
  childRoutes: Route[];
};

/**
 * Gives every matched route its own component owner.
 *
 * Route definitions commonly use inline component callbacks, which are not
 * necessarily transformed into Vynn component wrappers by the JSX compiler.
 * Keeping the route callback inside this component gives its subtree a
 * predictable owner and scopes route context to this matched route.
 */
function RouteView(props: RouteViewProps) {
  const renderRoute = () =>
    props.route.component({
      children: props.childRoutes.length ? (
        <RouteOutlet routes={props.childRoutes} parentPath={props.fullPath} />
      ) : undefined,
    });

  return (
    <RoutePathProvider value={props.fullPath}>
      {props.route.beforeLoad ? (
        <RouteLoadBoundary
          beforeLoad={props.route.beforeLoad}
          render={renderRoute}
        />
      ) : (
        renderRoute()
      )}
    </RoutePathProvider>
  );
}

/**
 * Renders one reactive routing level. Each outlet owns its own render range
 * so nested outlets continue observing location changes even when their
 * parent evaluates children inside an untracked boundary such as Await.
 */
export function RouteOutlet(props: { routes: Route[]; parentPath?: string }) {
  let previousMatch: MatchedRoute | undefined;
  let previousView: ReturnType<typeof RouteView> | null = null;

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

    const nextView = next
      ? (
          <RouteView
            route={next.route}
            fullPath={next.fullPath}
            childRoutes={next.route.children ?? []}
          />
        )
      : null;

    // Cache the matched route and its component tree. The enclosing $nodes
    // effect reruns this callback whenever this outlet's location changes.
    previousMatch = next;
    previousView = nextView;

    return nextView;
  });
}
