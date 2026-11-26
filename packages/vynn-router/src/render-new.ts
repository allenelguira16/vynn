import { $effect, $state, untrack, type JSX, type PropsWithChildren } from "vynn";
import {
  createRenderNewComponent,
  type RenderNewComponent,
} from "vynn/render_new/internal";
import {
  onScopeDispose,
  type DOMTemplateProgram,
  type TemplateBindingInstruction,
  type TemplateDefinition,
} from "vynn/render_new";

import { LocationProvider, RoutePathProvider } from "./context";
import { createRouter } from "./create-router";
import { isRenderNewLazyComponent } from "./render-new-lazy";
import { isFileRouteOutlet } from "./file-router-core";
import { isServer } from "./environment";
import { currentLocation, navigate } from "./location";
import { getRouteParams, matchRoute } from "./path";
import { commitClientRedirect, isClientRedirect } from "./redirect";
import {
  getRouterMatchState,
  subscribeRouterMatchState,
} from "./router-state";
import type { MatchedRoute } from "./matcher";
import type {
  BeforeLoadContext,
  Location,
  Route,
  RouterInstance,
  RouterOptions,
} from "./types";

type RouterProps<TContext> =
  | { router: RouterInstance<TContext> }
  | RouterOptions<TContext>;

const childSlotTemplate: TemplateDefinition = Object.freeze({
  namespace: "html",
  markup:
    "<!--__vynn_render_new_child_0_start__-->" +
    "<!--__vynn_render_new_child_0_end__-->",
  references: Object.freeze([
    Object.freeze({
      id: 0,
      kind: "anchor" as const,
      path: Object.freeze([0]),
    }),
  ]),
});

const linkTemplate: TemplateDefinition = Object.freeze({
  namespace: "html",
  markup:
    "<a>" +
    "<!--__vynn_render_new_child_0_start__-->" +
    "<!--__vynn_render_new_child_0_end__-->" +
    "</a>",
  references: Object.freeze([
    Object.freeze({
      id: 0,
      kind: "element" as const,
      path: Object.freeze([0]),
    }),
    Object.freeze({
      id: 1,
      kind: "anchor" as const,
      path: Object.freeze([0, 0]),
    }),
  ]),
});

function createChildSlotProgram(read: () => unknown): DOMTemplateProgram {
  return {
    template: childSlotTemplate,
    bindings: [
      {
        kind: "child",
        reference: 0,
        read,
      },
    ],
  };
}

function createComponentDescriptor(
  component: (props: PropsWithChildren) => JSX.Element,
  props: PropsWithChildren,
): RenderNewComponent {
  return createRenderNewComponent(
    () => component(props) as unknown as DOMTemplateProgram,
    props,
    component,
  );
}

function renderRoutePathBoundary(props: {
  path: string;
  children: unknown;
}): DOMTemplateProgram {
  RoutePathProvider({
    value: props.path,
    children: undefined as never,
  });

  return createChildSlotProgram(() => props.children);
}

type PreparedRouterState = {
  readonly pathname: string;
  readonly search: string;
  readonly branch: readonly MatchedRoute<unknown>[];
  readonly guards: WeakSet<object>;
};

const preparedRouterStates = new WeakMap<object, PreparedRouterState>();
const routerInstancesByProps = new WeakMap<object, RouterInstance<unknown>>();

type PreloadableRouteComponent = Route["component"] & {
  preload?: () => Promise<unknown> | undefined;
};

function isSameBranch(
  left: readonly MatchedRoute<unknown>[],
  right: readonly MatchedRoute<unknown>[],
): boolean {
  return left.length === right.length &&
    left.every((match, index) => match.node === right[index]?.node);
}

/**
 * Resolves every lazy module and beforeLoad guard in the router's current
 * branch. The result is cached for the current URL and consumed by the
 * synchronous render_new serializer or initial client hydration.
 */
async function prepareRouter<TContext>(
  router: RouterInstance<TContext>,
): Promise<boolean> {
  for (let redirects = 0; redirects < 10; redirects++) {
    const location = {
      pathname: router.state.location.pathname,
      search: router.state.location.search,
    };
    const branch = getRouterMatchState<TContext>(router).value;
    const pendingModules: Promise<unknown>[] = [];

    for (const match of branch) {
      const component = match.route.component as PreloadableRouteComponent;
      const pending = component.preload?.();
      if (pending) pendingModules.push(pending);
    }

    await Promise.all(pendingModules);

    const guards = new WeakSet<object>();
    let redirected = false;

    for (const match of branch) {
      const beforeLoad = match.route.beforeLoad;
      if (!beforeLoad) continue;

      const controller = new AbortController();
      try {
        await beforeLoad({
          context: router.context,
          location,
          params: getRouteParams(match.fullPath, location),
          search: new URLSearchParams(location.search),
          signal: controller.signal,
        });
        guards.add(match.node);
      } catch (error) {
        if (!isServer && isClientRedirect(error)) {
          commitClientRedirect(
            error,
            () =>
              router.state.location.pathname === location.pathname &&
              router.state.location.search === location.search,
            router.state.location,
            false,
          );

          if (
            router.state.location.pathname !== location.pathname ||
            router.state.location.search !== location.search
          ) {
            redirected = true;
            break;
          }
        }

        throw error;
      }
    }

    if (redirected) continue;

    const currentBranch = getRouterMatchState<TContext>(router).value;
    if (
      router.state.location.pathname !== location.pathname ||
      router.state.location.search !== location.search ||
      !isSameBranch(
        branch as readonly MatchedRoute<unknown>[],
        currentBranch as readonly MatchedRoute<unknown>[],
      )
    ) {
      continue;
    }

    preparedRouterStates.set(router, {
      pathname: location.pathname,
      search: location.search,
      branch: branch as readonly MatchedRoute<unknown>[],
      guards,
    });
    return true;
  }

  throw new Error(
    "[vynn-router/render_new]: Route preparation exceeded the redirect limit.",
  );
}

function hasPreparedGuard<TContext>(
  router: RouterInstance<TContext>,
  match: MatchedRoute<TContext>,
): boolean {
  const prepared = preparedRouterStates.get(router);
  return !!prepared &&
    prepared.pathname === router.state.location.pathname &&
    prepared.search === router.state.location.search &&
    prepared.branch.some((entry) => entry.node === match.node) &&
    prepared.guards.has(match.node);
}

type RouteGuardState =
  | { status: "pending" }
  | { status: "allowed" }
  | { status: "redirect" }
  | { status: "error"; error: unknown };

function createGuardedRoute<TContext>(
  router: RouterInstance<TContext>,
  match: MatchedRoute<TContext>,
  child: RenderNewComponent | null,
): RenderNewComponent | null {
  const beforeLoad = match.route.beforeLoad;
  if (!beforeLoad) return child;
  if (hasPreparedGuard(router, match)) return child;

  if (isServer) {
    throw new Error(
      "[vynn-router/render_new]: A guarded route must be prepared with renderTemplateProgramToStringAsync().",
    );
  }

  return createRenderNewComponent(() => {
    const state = $state<RouteGuardState>({ status: "pending" });
    let revision = 0;

    $effect(() => {
      const location = {
        pathname: router.state.location.pathname,
        search: router.state.location.search,
      };
      const currentRevision = ++revision;
      const controller = new AbortController();
      state.value = { status: "pending" };

      const isCurrent = () =>
        currentRevision === revision && !controller.signal.aborted;

      const complete = () => {
        if (isCurrent()) state.value = { status: "allowed" };
      };

      const fail = (error: unknown) => {
        if (!isCurrent()) return;

        if (isClientRedirect(error)) {
          state.value = { status: "redirect" };
          commitClientRedirect(error, isCurrent, router.state.location);
          return;
        }

        state.value = { status: "error", error };
      };

      const context: BeforeLoadContext<TContext> = {
        context: router.context,
        location,
        params: getRouteParams(match.fullPath, location),
        search: new URLSearchParams(location.search),
        signal: controller.signal,
      };

      try {
        const result = untrack(() => beforeLoad(context));
        if (
          result !== null &&
          (typeof result === "object" || typeof result === "function") &&
          "then" in result &&
          typeof result.then === "function"
        ) {
          void Promise.resolve(result).then(complete, fail);
        } else {
          complete();
        }
      } catch (error) {
        fail(error);
      }

      return () => controller.abort();
    });

    return createChildSlotProgram(() => {
      const current = state.value;
      if (current.status === "pending" || current.status === "redirect") return null;
      if (current.status === "error") throw current.error;
      return child;
    });
  });
}

function createRouteView<TContext>(
  router: RouterInstance<TContext>,
  match: MatchedRoute<TContext>,
  depth: number,
): RenderNewComponent {
  const component = match.route.component as unknown as (
    props: PropsWithChildren,
  ) => JSX.Element;

  const routeChildren = match.node.children.length > 0
    ? createRouteOutlet(router, depth + 1)
    : undefined;

  const componentProps = (
    routeChildren === undefined
      ? {}
      : { children: routeChildren as unknown as JSX.Element }
  ) as PropsWithChildren;

  const routeComponent = isFileRouteOutlet(component)
    ? routeChildren ?? null
    : isRenderNewLazyComponent(component)
      ? component(componentProps) as unknown as RenderNewComponent
      : createComponentDescriptor(component, componentProps);
  const guardedRoute = createGuardedRoute(router, match, routeComponent);
  const boundaryProps = {
    path: match.fullPath,
    children: guardedRoute,
  };

  return createRenderNewComponent(
    () => renderRoutePathBoundary(boundaryProps),
    boundaryProps,
    renderRoutePathBoundary,
  );
}

function createNotFoundView<TContext>(
  router: RouterInstance<TContext>,
): RenderNewComponent | null {
  if (!router.notFound) return null;

  const component = router.notFound as unknown as (
    props: PropsWithChildren,
  ) => JSX.Element;

  return createComponentDescriptor(component, {} as PropsWithChildren);
}

function createRouteOutlet<TContext>(
  router: RouterInstance<TContext>,
  depth: number,
): RenderNewComponent {
  return createRenderNewComponent(() => {
    const initialMatch = getRouterMatchState<TContext>(router).value[depth] ?? null;
    const activeMatch = $state<MatchedRoute<TContext> | null>(initialMatch);
    let activeNode = initialMatch?.node;

    const unsubscribe = subscribeRouterMatchState<TContext>(router, (branch) => {
      const nextMatch = branch[depth] ?? null;
      if (nextMatch?.node === activeNode) return;

      activeNode = nextMatch?.node;
      activeMatch.value = nextMatch;
    });

    onScopeDispose(unsubscribe);

    return createChildSlotProgram(() => {
      const match = activeMatch.value;

      if (match) {
        return createRouteView(router, match, depth);
      }

      return createNotFoundView(router);
    });
  });
}

/**
 * Renders an existing router instance with the render_new runtime.
 *
 * Import this component from vynn-router/render_new when the Vite plugin is
 * configured with renderer: "new". Route components must also be compiled
 * for render_new.
 */
export function Router<TContext = undefined>(
  props: RouterProps<TContext>,
): JSX.Element {
  const ownsRouter = !("router" in props);
  let router: RouterInstance<TContext>;

  if ("router" in props) {
    router = props.router;
  } else {
    const existing = routerInstancesByProps.get(props) as RouterInstance<TContext> | undefined;
    router = existing ?? createRouter(props);
    if (!existing) {
      routerInstancesByProps.set(
        props,
        router as RouterInstance<unknown>,
      );
    }
  }

  return createRenderNewComponent(
    () => {
      if (ownsRouter) {
        onScopeDispose(() => router.dispose());
      }

      LocationProvider({
        value: router.state.location,
        children: undefined as never,
      });

      return createChildSlotProgram(() => createRouteOutlet(router, 0));
    },
    props,
    Router,
    () => prepareRouter(router),
  ) as unknown as JSX.Element;
}

export type RenderNewLinkProps = PropsWithChildren<{
  href: string;
  activeClass?: string;
  class?: string;
  target?: string;
  download?: boolean | string;
}>;

/** Checks whether a local target matches the current route pathname. */
export function isActiveRoute(
  targetPath: string,
  location: Location = currentLocation(),
): boolean {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(targetPath)) {
    return false;
  }

  try {
    const target = new URL(
      targetPath,
      "http://vynn.local" + location.pathname + location.search,
    );

    if (target.origin !== "http://vynn.local") return false;
    return matchRoute(target.pathname, true, location);
  } catch {
    return false;
  }
}

/**
 * An anchor component that preserves native modified-click behavior and uses
 * the active router for ordinary same-origin navigation.
 */
export function Link(props: RenderNewLinkProps): JSX.Element {
  const location = currentLocation();

  const handleClick = (event: Event): void => {
    if (isServer || event.defaultPrevented) return;

    const mouseEvent = event as MouseEvent;

    if (
      mouseEvent.button !== 0 ||
      mouseEvent.metaKey ||
      mouseEvent.ctrlKey ||
      mouseEvent.shiftKey ||
      mouseEvent.altKey ||
      props.download !== undefined ||
      (props.target !== undefined && props.target.toLowerCase() !== "_self")
    ) {
      return;
    }

    const target = new URL(props.href, window.location.href);

    if (
      target.origin !== window.location.origin ||
      (target.protocol !== "http:" && target.protocol !== "https:")
    ) {
      return;
    }

    event.preventDefault();
    navigate(target.pathname + target.search + target.hash, location);
  };

  const bindings: readonly TemplateBindingInstruction[] = [
    {
      kind: "attribute",
      reference: 0,
      name: "href",
      read: () => props.href,
    },
    {
      kind: "attribute",
      reference: 0,
      name: "target",
      read: () => props.target,
    },
    {
      kind: "attribute",
      reference: 0,
      name: "download",
      read: () => props.download,
    },
    {
      kind: "attribute",
      reference: 0,
      name: "class",
      read: () => {
        const className = props.class ?? "";
        const activeClass = isActiveRoute(props.href, location)
          ? props.activeClass ?? ""
          : "";

        return (className + " " + activeClass).trim();
      },
    },
    {
      kind: "event",
      reference: 0,
      event: "click",
      read: () => handleClick,
    },
    {
      kind: "child",
      reference: 1,
      read: () => props.children,
    },
  ];

  return {
    template: linkTemplate,
    bindings,
  } as unknown as JSX.Element;
}

export { createRouter } from "./create-router";
export { createBrowserHistory, createMemoryHistory } from "./history";
export { $location, navigate, replace } from "./location";
export { $params, $search } from "./params";
export { redirect, type RedirectOptions, type RedirectStatus } from "./redirect";
export type {
  BeforeLoadContext,
  Location,
  Route,
  RouteParams,
  RouterInstance,
  RouterOptions,
  RouterState,
} from "./types";

export { lazy } from "./render-new-lazy";
export { toFileRouter } from "./file-router-render-new";
export type {
  FileRouteModuleMap,
  FileRouteModuleMetadata,
} from "./file-router-core";
