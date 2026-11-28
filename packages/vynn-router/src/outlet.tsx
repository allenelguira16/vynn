import { $computed, $state, disposeOwner, getOwner, onDestroy, runWithOwner, untrack } from "vynn";

import type { RouterInstance } from "./types";

import { RoutePathProvider } from "./context";
import {
  getRouterMatchState,
  subscribeRouterMatchState,
} from "./router-state";
import { findSlotBranch, type CompiledRoute } from "./matcher";
import { RouteSlotsProvider } from "./slot-context";
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
type RouteOwner = NonNullable<ReturnType<typeof getOwner>>;

function RouteView<TContext>(props: {
  router: RouterInstance<TContext>;
  match: MatchedRoute<TContext>;
  depth: number;
  slotParent?: CompiledRoute;
  slotName?: string;
  onOwner(owner: RouteOwner): void;
}) {
  const routeOwner = getOwner();
  if (routeOwner) props.onOwner(routeOwner);

  const RenderRoute = () => {
    const Component = props.match.route.component;
    const hasChildren = props.match.node.children.length > 0;

    return (
      <RouteSlotsProvider
        value={{
          router: props.router as unknown as RouterInstance<unknown>,
          parentNode: props.match.node,
        }}
      >
        <Component>
          {hasChildren && (
            <RouteOutlet
              router={props.router}
              depth={props.depth + 1}
              slotParent={props.slotParent}
              slotName={props.slotName}
            />
          )}
        </Component>
      </RouteSlotsProvider>
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
  slotParent?: CompiledRoute;
  slotName?: string;
}) {
  const depth = props.depth ?? 0;
  const matchState = getRouterMatchState<TContext>(props.router);
  const owner = getOwner();
  // Store a view factory rather than eagerly creating the destination tree.
  // The factory runs when the reactive output updates, after the router's
  // navigation batch has published the new location.
  const view = $state<(() => ReturnType<typeof RouteView> | null) | null>(null);

  let previousNode: MatchedRoute<TContext>["node"] | undefined;
  let currentViewOwner: RouteOwner | null = null;
  let hasCommitted = false;
  let disposed = false;

  const renderBranch = (mainBranch: readonly MatchedRoute<TContext>[]) => {
    const branch = props.slotParent && props.slotName
      ? findSlotBranch(mainBranch, props.slotParent, props.slotName) ?? []
      : mainBranch;
    const next = branch[depth];

    if (hasCommitted && previousNode === next?.node) {
      return;
    }

    if (disposed) return;

    // DOM removal is observed asynchronously by Vynn. Dispose the outgoing
    // route owner now so its reactive effects cannot run against the new URL
    // before the MutationObserver performs the eventual DOM cleanup.
    if (currentViewOwner && !currentViewOwner.disposed) {
      disposeOwner(currentViewOwner);
    }
    currentViewOwner = null;

    runWithOwner(owner, () => {
      const nextView = next
        ? () => (
            <RoutePathProvider value={next.fullPath}>
              <RouteView
                router={props.router}
                match={next}
                depth={depth}
                slotParent={props.slotParent}
                slotName={props.slotName}
                onOwner={(routeOwner) => {
                  currentViewOwner = routeOwner;
                }}
              />
            </RoutePathProvider>
          )
        : !props.slotParent && props.router.notFound
          ? () => {
              const NotFound = props.router.notFound!;
              return <NotFound />;
            }
          : null;

      previousNode = next?.node;
      hasCommitted = true;
      view.value = nextView;
    });
  };

  const unsubscribe = subscribeRouterMatchState(props.router, renderBranch);

  onDestroy(() => {
    disposed = true;
    unsubscribe();
  });

  // Render the current branch once the listener is registered, so a branch
  // published immediately afterward cannot be missed.
  renderBranch(untrack(() => matchState.value));

  return <>{view.value?.()}</>;
}
