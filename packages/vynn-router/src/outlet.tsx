import { $async, $computed } from "vynn";
import { $nodes } from "vynn/render";

import { RoutePathProvider } from "./context";
import { currentLocation } from "./location";
import { getRouteParams, joinPaths, matchRoute } from "./path";
import { isClientRedirect } from "./redirect";
import type { Location, Route } from "./types";

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

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as PromiseLike<unknown>).then === "function"
  );
}

/**
 * Runs beforeLoad before creating the matched route component. Keeping the
 * component invocation inside the guarded region also delays lazy() imports
 * until the guard has completed successfully.
 */
function RouteView(props: MatchedRoute) {
  const { route, fullPath } = props;
  const childRoutes = route.children ?? [];

  const renderRoute = () => {
    const Component = route.component;

    return (
      <Component>
        {!!childRoutes.length && (
          <RouteOutlet routes={childRoutes} parentPath={fullPath} />
        )}
      </Component>
    );
  };

  if (!route.beforeLoad) {
    return renderRoute();
  }

  const activeLocation = currentLocation();
  const location: Location = {
    pathname: activeLocation.pathname,
    search: activeLocation.search,
  };

  let result: unknown;

  try {
    result = route.beforeLoad({
      location,
      params: getRouteParams(fullPath, location),
      search: new URLSearchParams(location.search),
    });
  } catch (error) {
    if (isClientRedirect(error)) {
      return null;
    }

    throw error;
  }

  if (!isPromiseLike(result)) {
    return renderRoute();
  }

  // Normalize a synchronous thenable and swallow only the private CSR
  // redirect signal. A thrown Response remains rejected and reaches the SSR
  // request handler.
  const guarded = Promise.resolve(result).then(
    () => true,
    (error: unknown) => {
      if (isClientRedirect(error)) {
        return false;
      }

      throw error;
    },
  );

  const allowed = $async(() => guarded);

  return $nodes(() => (allowed.value ? renderRoute() : null));
}

/** Renders one reactive routing level. Child routes use nested outlets. */
export function RouteOutlet(props: { routes: Route[]; parentPath?: string }) {
  let previousMatch: MatchedRoute | undefined;
  let previousView: ReturnType<typeof RouteView> | null = null;

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

    let nextView: ReturnType<typeof RouteView> | null = null;

    if (next) {
      const { route, fullPath } = next;

      nextView = (
        <RoutePathProvider value={fullPath}>
          <RouteView route={route} fullPath={fullPath} />
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
