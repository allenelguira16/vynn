import { $computed, $renderEffect, $state, getOwner, onDestroy, runWithOwner, untrack } from "vynn";

import type { Location, Route } from "./types";

import { RoutePathProvider } from "./context";
import { isServer } from "./environment";
import { currentLocation } from "./location";
import { getRouteParams } from "./path";
import { commitClientRedirect, isClientRedirect } from "./redirect";
import {
  compileRoutes,
  findCompiledMatch,
  type CompiledRoute,
  type MatchedRoute,
} from "./matcher";

export { findMatch } from "./matcher";

type RouteGuardResult =
  | { type: "allowed" }
  | { type: "redirect"; signal: unknown; revision: number };

type PreloadableComponent = Route["component"] & {
  preload?: () => Promise<unknown>;
};

function snapshotLocation(location: Location): Location {
  return {
    pathname: location.pathname,
    search: location.search,
  };
}

/**
 * Loads the lazy modules selected by one route branch before that branch is
 * mounted. Nested outlets keep their own current view, so each transition
 * resolves only the branch below that outlet.
 */
function preloadRouteBranch<TContext>(
  match: MatchedRoute<TContext>,
  location: Location,
): Promise<void> | undefined {
  const pending: Promise<unknown>[] = [];
  const component = match.route.component as PreloadableComponent;

  if (typeof component.preload === "function") {
    pending.push(component.preload());
  }

  const childMatch = findCompiledMatch(match.node.children, location);
  if (childMatch) {
    const childPreload = preloadRouteBranch(childMatch, location);
    if (childPreload) pending.push(childPreload);
  }

  return pending.length > 0
    ? Promise.all(pending).then(() => undefined)
    : undefined;
}

/**
 * Owns one matched route component. Its nested outlet is an independent
 * transition boundary, which lets parent layouts survive child navigation.
 */
function RouteView<TContext>(props: {
  match: MatchedRoute<TContext>;
  context: TContext;
  notFound?: Route<TContext>["component"];
}) {
  const RenderRoute = () => {
    const Component = props.match.route.component;
    const children = props.match.node.children;

    return (
      <Component>
        {children.length > 0 && (
          <RouteOutlet
            compiledRoutes={children}
            context={props.context}
            notFound={props.notFound}
          />
        )}
      </Component>
    );
  };

  const beforeLoad = props.match.route.beforeLoad;
  if (!beforeLoad) return <RenderRoute />;

  let guardRevision = 0;
  let activeController: AbortController | undefined;
  let scheduledRedirect: unknown;

  onDestroy(() => activeController?.abort());

  const allowed = $computed<RouteGuardResult>(async () => {
    const revision = ++guardRevision;
    activeController?.abort();

    const location = untrack(() => snapshotLocation(currentLocation()));
    const controller = new AbortController();
    activeController = controller;

    try {
      // Run guards outside the resource's synchronous tracking pass. Reactive
      // reads inside a guard are not navigation dependencies.
      await Promise.resolve();

      if (controller.signal.aborted) {
        return { type: "allowed" };
      }

      await untrack(() =>
        beforeLoad({
          context: props.context,
          location,
          params: getRouteParams(props.match.fullPath, location),
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

  const render = () => {
    // Keep the guard decision out of an enclosing page Await boundary.
    const result = runWithOwner(null, () => allowed.value);

    if (result.type === "redirect" && isClientRedirect(result.signal)) {
      if (scheduledRedirect !== result.signal) {
        scheduledRedirect = result.signal;
        commitClientRedirect(
          result.signal,
          () => guardRevision === result.revision && !activeController?.signal.aborted,
          currentLocation(),
        );
      }

      return null;
    }

    scheduledRedirect = undefined;
    return result.type === "allowed" ? <RenderRoute /> : null;
  };

  return <>{render()}</>;
}

/**
 * Renders one level of the compiled route tree.
 *
 * The outlet is intentionally stateful: while a destination's lazy modules
 * load, its current view remains mounted. Child outlets own child transitions,
 * preserving parent layouts and their component owners.
 */
export function RouteOutlet<TContext = undefined>(props: {
  routes?: Route<TContext>[];
  compiledRoutes?: readonly CompiledRoute[];
  parentPath?: string;
  context: TContext;
  notFound?: Route<TContext>["component"];
}) {
  const routes = props.compiledRoutes ?? compileRoutes(props.routes ?? []);
  const owner = getOwner();
  const view = $state<ReturnType<typeof RouteView> | null>(null);

  let previousNode: CompiledRoute | undefined;
  let revision = 0;
  let disposed = false;
  let hasCommitted = false;

  onDestroy(() => {
    disposed = true;
    revision++;
  });

  $renderEffect(() => {
    const location = snapshotLocation(currentLocation());
    const next = findCompiledMatch<TContext>(routes, location);
    const currentRevision = ++revision;

    // Query-only and parameter-only updates are handled by the reactive
    // location, $params, and $search readers without replacing route owners.
    if (hasCommitted && previousNode === next?.node) {
      return;
    }

    const commit = () => {
      if (disposed || currentRevision !== revision) return;

      runWithOwner(owner, () => {
        const latest = currentLocation();
        if (
          latest.pathname !== location.pathname ||
          latest.search !== location.search
        ) {
          return;
        }

        const nextView = next
          ? untrack(() => (
              <RoutePathProvider value={next.fullPath}>
                <RouteView
                  match={next}
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

        previousNode = next?.node;
        hasCommitted = true;
        view.value = nextView;
      });
    };

    // The initial route follows normal lazy/Await semantics. Later navigations
    // preload the complete selected branch before inserting any new route
    // owner, preventing a newly mounted parent outlet from appearing empty.
    const preload =
      !isServer && hasCommitted && next
        ? preloadRouteBranch(next, location)
        : undefined;

    if (preload) {
      void preload.then(commit, commit);
      return;
    }

    commit();
  });

  return <>{view.value}</>;
}
