import { $computed, $renderEffect, $state, getOwner, onDestroy, runWithOwner, untrack } from "vynn";

import type { Location, Route } from "./types";

import { RoutePathProvider } from "./context";
import { isServer } from "./environment";
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
  | { type: "redirect"; signal: unknown; revision: number }
  | { type: "error"; error: unknown };

type CompletedRouteGuardResult = Exclude<RouteGuardResult, { type: "redirect" }>;

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

type PreloadableRouteComponent = Route["component"] & {
  preload?: () => Promise<unknown>;
};

type PreparedRouteGuard = {
  fullPath: string;
  result: CompletedRouteGuardResult;
  controller: AbortController;
};

type PreparedRouteGuards<TContext = undefined> = Map<
  Route<TContext>,
  PreparedRouteGuard
>;

type PreparedRouteBranchResult<TContext> =
  | { type: "ready"; guards: PreparedRouteGuards<TContext> }
  | { type: "redirect"; signal: unknown }
  | { type: "cancelled" };

/** Finds every selected route from this outlet down to the terminal page. */
function findMatchedRouteBranch<TContext>(
  match: MatchedRoute<TContext>,
  location: Location,
): MatchedRoute<TContext>[] {
  const branch = [match];
  const childMatch = findMatch(match.route.children ?? [], location, match.fullPath);

  if (childMatch) {
    branch.push(...findMatchedRouteBranch(childMatch, location));
  }

  return branch;
}

function sameMatchedBranch<TContext>(
  left: MatchedRoute<TContext>[],
  right: MatchedRoute<TContext>[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (match, index) =>
        match.route === right[index]?.route && match.fullPath === right[index]?.fullPath,
    )
  );
}

/** Preloads every lazy component in the selected route branch. */
function preloadRouteBranch<TContext>(
  match: MatchedRoute<TContext>,
  location: Location,
): Promise<void> | undefined {
  const component = match.route.component as PreloadableRouteComponent;
  const pending: Promise<unknown>[] = [];

  if (typeof component.preload === "function") {
    pending.push(component.preload());
  }

  const childMatch = findMatch(match.route.children ?? [], location, match.fullPath);
  if (childMatch) {
    const childPreload = preloadRouteBranch(childMatch, location);
    if (childPreload) pending.push(childPreload);
  }

  return pending.length > 0 ? Promise.all(pending).then(() => undefined) : undefined;
}

/**
 * Runs a route guard against the location snapshot for this navigation.
 *
 * The initial microtask keeps the user's callback outside the synchronous
 * render/effect pass. Reads inside the callback are untracked, and the signal
 * lets a superseding navigation cancel work that is no longer relevant.
 */
async function runBeforeLoad<TContext>(
  route: Route<TContext>,
  fullPath: string,
  context: TContext,
  location: Location,
  signal: AbortSignal,
  revision: number,
  captureErrors = false,
): Promise<RouteGuardResult> {
  await Promise.resolve();

  if (signal.aborted) {
    return { type: "allowed" };
  }

  try {
    await untrack(() =>
      route.beforeLoad!({
        context,
        location,
        params: getRouteParams(fullPath, location),
        search: new URLSearchParams(location.search),
        signal,
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

    if (captureErrors) {
      return { type: "error", error };
    }

    throw error;
  }
}

/**
 * Validates the entire selected destination branch, from layouts to page.
 * Each RouteView receives its own controller/result so nested outlets do not
 * execute a guard a second time when their components are eventually mounted.
 */
async function prepareRouteBranch<TContext>(
  branch: MatchedRoute<TContext>[],
  context: TContext,
  location: Location,
  revision: number,
  controllers: AbortController[],
): Promise<PreparedRouteBranchResult<TContext>> {
  const guards: PreparedRouteGuards<TContext> = new Map();

  for (const match of branch) {
    if (!match.route.beforeLoad) continue;

    const controller = new AbortController();
    controllers.push(controller);

    const result = await runBeforeLoad(
      match.route,
      match.fullPath,
      context,
      location,
      controller.signal,
      revision,
      true,
    );

    if (controller.signal.aborted) {
      return { type: "cancelled" };
    }

    if (result.type === "redirect") {
      return {
        type: "redirect",
        signal: result.signal,
      };
    }

    guards.set(match.route, {
      fullPath: match.fullPath,
      result,
      controller,
    });

    // An error on a parent route prevents its descendants from becoming active.
    if (result.type === "error") break;
  }

  return { type: "ready", guards };
}

function abortControllers(controllers: AbortController[] | undefined): void {
  for (const controller of controllers ?? []) {
    controller.abort();
  }
}

/**
 * Runs the guard for an initial/SSR RouteView that was not prevalidated by its
 * RouteOutlet during client navigation.
 *
 * The route component remains mounted when only its params or search string
 * change, so the guard uses the location snapshot from route entry and does
 * not revalidate for those in-place URL updates.
 */
function RouteView<TContext>(
  props: MatchedRoute<TContext> & {
    context: TContext;
    notFound?: Route<TContext>["component"];
    preparedGuard?: PreparedRouteGuard;
    preparedGuards?: PreparedRouteGuards<TContext>;
    preparedBranchControllers?: AbortController[];
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
            preparedGuards={props.preparedGuards}
          />
        )}
      </Component>
    );
  };

  // A committed branch owns all guard signals prepared for its descendants.
  // Individual guarded RouteViews also abort their own signal when disposed.
  if (props.preparedBranchControllers?.length) {
    onDestroy(() => abortControllers(props.preparedBranchControllers));
  }

  if (props.preparedGuard) {
    onDestroy(() => props.preparedGuard?.controller.abort());

    if (props.preparedGuard.result.type === "error") {
      throw props.preparedGuard.result.error;
    }

    return <RenderRoute />;
  }

  if (!props.route.beforeLoad) {
    return <RenderRoute />;
  }

  let guardRevision = 0;
  let activeGuardController: AbortController | undefined;

  // Initial/SSR views own their guard here. Client navigations preflight guards
  // in RouteOutlet, which owns their controller until the committed view is replaced.
  onDestroy(() => activeGuardController?.abort());

  const allowed = $computed<RouteGuardResult>(async () => {
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

    return runBeforeLoad(
      route,
      fullPath,
      props.context,
      location,
      controller.signal,
      revision,
    );
  });

  let scheduledRedirect: unknown;

  const canRender = () => {
    // Read outside the ambient owner so an enclosing Await cannot claim this
    // router-level decision as part of its page fallback. The async resource
    // itself is still bound to this RouteView's owner.
    const result = runWithOwner(null, () => allowed.value);

    if (result.type === "error") {
      throw result.error;
    }

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
 * The outlet validates all guards in a destination's selected branch before
 * publishing its first route view. This matters for file routes, where a folder
 * outlet can sit between the current page and a guarded descendant page.
 */
export function RouteOutlet<TContext = undefined>(props: {
  routes: Route<TContext>[];
  parentPath?: string;
  context: TContext;
  notFound?: Route<TContext>["component"];
  preparedGuards?: PreparedRouteGuards<TContext>;
}) {
  let previousMatch: MatchedRoute<TContext> | undefined;
  let pendingBranch: MatchedRoute<TContext>[] | undefined;
  let pendingBranchControllers: AbortController[] | undefined;
  let inheritedPreparedGuards = props.preparedGuards;
  let hasRendered = false;
  let navigationRevision = 0;
  let disposed = false;
  const owner = getOwner();
  const view = $state<ReturnType<typeof RouteView> | null>(null);

  const sameMatch = (
    left: MatchedRoute<TContext> | undefined,
    right: MatchedRoute<TContext> | undefined,
  ) => left?.route === right?.route && left?.fullPath === right?.fullPath;

  onDestroy(() => {
    disposed = true;
    navigationRevision++;
    abortControllers(pendingBranchControllers);
  });

  $renderEffect(() => {
    // Track the complete URL at the routing boundary.
    const activeLocation = currentLocation();
    const location: Location = {
      pathname: activeLocation.pathname,
      search: activeLocation.search,
    };
    const next = findMatch(props.routes, location, props.parentPath ?? "");
    const branch = next ? findMatchedRouteBranch(next, location) : [];

    // Keep an in-flight destination branch when only params/search change.
    // A deeper route change produces a different branch and supersedes it.
    if (pendingBranch && sameMatchedBranch(pendingBranch, branch)) {
      return;
    }

    const revision = ++navigationRevision;

    // Cancel all guards associated with the previous pending destination.
    abortControllers(pendingBranchControllers);
    pendingBranchControllers = undefined;
    pendingBranch = undefined;

    if (hasRendered && sameMatch(previousMatch, next)) {
      // The nested outlet owns changes below a route that remains selected here.
      return;
    }

    const commitView = (
      preparedGuards?: PreparedRouteGuards<TContext>,
      preparedBranchControllers?: AbortController[],
    ) => {
      if (disposed || navigationRevision !== revision) return;

      const latestLocation = currentLocation();
      const latestMatch = findMatch(props.routes, latestLocation, props.parentPath ?? "");
      const latestBranch = latestMatch
        ? findMatchedRouteBranch(latestMatch, latestLocation)
        : [];

      if (!sameMatchedBranch(branch, latestBranch)) {
        return;
      }

      runWithOwner(owner, () => {
        const preparedGuard = next && preparedGuards
          ? preparedGuards.get(next.route)
          : undefined;

        if (next && preparedGuard?.fullPath === next.fullPath) {
          preparedGuards!.delete(next.route);
        }

        const nextView = next
          ? untrack(() => (
              <RoutePathProvider value={next.fullPath}>
                <RouteView
                  route={next.route}
                  fullPath={next.fullPath}
                  context={props.context}
                  notFound={props.notFound}
                  preparedGuard={preparedGuard?.fullPath === next.fullPath ? preparedGuard : undefined}
                  preparedGuards={preparedGuards}
                  preparedBranchControllers={preparedBranchControllers}
                />
              </RoutePathProvider>
            ))
          : props.notFound
            ? untrack(() => {
                const NotFound = props.notFound!;
                return <NotFound />;
              })
            : null;

        pendingBranch = undefined;
        pendingBranchControllers = undefined;
        hasRendered = true;
        previousMatch = next;
        view.value = nextView;
      });
    };

    // A newly mounted nested outlet consumes prepared results passed down
    // from its parent. The map is one-shot and is not reused on later navigations.
    if (inheritedPreparedGuards) {
      const preparedGuards = inheritedPreparedGuards;
      inheritedPreparedGuards = undefined;
      commitView(preparedGuards);
      return;
    }

    // Validate every guard in the destination branch before replacing the
    // current view. This includes guards on file-router page modules nested
    // under guard-free folder outlet routes.
    const hasDestinationGuard = branch.some((match) => !!match.route.beforeLoad);

    if (!isServer && hasRendered && next && hasDestinationGuard) {
      const controllers: AbortController[] = [];
      pendingBranch = branch;
      pendingBranchControllers = controllers;

      void prepareRouteBranch(
        branch,
        props.context,
        location,
        revision,
        controllers,
      ).then((prepared) => {
        if (disposed || navigationRevision !== revision) {
          abortControllers(controllers);
          return;
        }

        if (prepared.type === "cancelled") {
          abortControllers(controllers);
          return;
        }

        if (prepared.type === "redirect") {
          commitClientRedirect(
            prepared.signal,
            () =>
              !disposed &&
              navigationRevision === revision &&
              pendingBranchControllers === controllers &&
              !controllers.some((controller) => controller.signal.aborted),
            currentLocation(),
          );
          return;
        }

        const preload = preloadRouteBranch(next, currentLocation());
        if (preload) {
          void preload.then(
            () => commitView(prepared.guards, controllers),
            () => commitView(prepared.guards, controllers),
          );
          return;
        }

        commitView(prepared.guards, controllers);
      });

      return;
    }

    // Preserve the current route while any lazy component in the destination
    // branch loads, even when no route guard is present.
    const preload =
      !isServer && hasRendered && next ? preloadRouteBranch(next, location) : undefined;

    if (preload) {
      pendingBranch = branch;
      void preload.then(
        () => commitView(),
        () => commitView(),
      );
      return;
    }

    commitView();
  });

  return <>{view.value}</>;
}
