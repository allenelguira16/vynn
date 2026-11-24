import { $computed, $renderEffect, $state, getOwner, onDestroy, runWithOwner, untrack } from "vynn";

import type { Route, RouterInstance } from "./types";

import { RoutePathProvider } from "./context";
import { getRouterMatchState } from "./router-state";
import { getRouteParams } from "./path";
import { commitClientRedirect, isClientRedirect } from "./redirect";
import type { MatchedRoute } from "./matcher";

export { findMatch } from "./matcher";

type RouteGuardResult =
  | { type: "allowed" }
  | { type: "redirect"; signal: unknown; revision: number };

/**
 * Owns one committed route component. Child outlets read the router's already
 * resolved branch at the next depth, so this route owner survives child
 * navigation and no outlet performs its own route matching.
 */
function RouteView<TContext>(props: {
  router: RouterInstance<TContext>;
  match: MatchedRoute<TContext>;
  depth: number;
}) {
  const RenderRoute = () => {
    const Component = props.match.route.component;
    const hasChildren = props.match.node.children.length > 0;

    return (
      <Component>
        {hasChildren && (
          <RouteOutlet
            router={props.router}
            depth={props.depth + 1}
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

    const activeLocation = props.router.state.location;
    const location = untrack(() => ({
      pathname: activeLocation.pathname,
      search: activeLocation.search,
    }));
    const controller = new AbortController();
    activeController = controller;

    try {
      // Guards run outside the resource's synchronous tracking pass. Reactive
      // reads inside a guard do not become navigation dependencies.
      await Promise.resolve();

      if (controller.signal.aborted) {
        return { type: "allowed" };
      }

      await untrack(() =>
        beforeLoad({
          context: props.router.context,
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
          props.router.state.location,
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
 * Renders one depth of the router's committed match branch.
 *
 * The router owns matching, cancellation, and lazy preloading. This component
 * only reconciles the route at its depth and preserves its owner when deeper
 * matches change.
 */
export function RouteOutlet<TContext = undefined>(props: {
  router: RouterInstance<TContext>;
  depth?: number;
}) {
  const depth = props.depth ?? 0;
  const matchState = getRouterMatchState<TContext>(props.router);
  const owner = getOwner();
  const view = $state<ReturnType<typeof RouteView> | null>(null);

  let previousNode: MatchedRoute<TContext>["node"] | undefined;
  let hasCommitted = false;
  let disposed = false;

  onDestroy(() => {
    disposed = true;
  });

  $renderEffect(() => {
    const next = matchState.value[depth];

    if (hasCommitted && previousNode === next?.node) {
      return;
    }

    runWithOwner(owner, () => {
      if (disposed) return;

      const nextView = next
        ? untrack(() => (
            <RoutePathProvider value={next.fullPath}>
              <RouteView
                router={props.router}
                match={next}
                depth={depth}
              />
            </RoutePathProvider>
          ))
        : props.router.notFound
          ? untrack(() => {
              const NotFound = props.router.notFound!;
              return <NotFound />;
            })
          : null;

      previousNode = next?.node;
      hasCommitted = true;
      view.value = nextView;
    });
  });

  return <>{view.value}</>;
}
