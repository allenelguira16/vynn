import type { JSX } from "../types/jsx";

import {
  finishServerRenderedLazy,
  getServerRenderedLazyRange,
  withServerRenderedLazy,
} from "../client/hydration";
import { LAZY_END_SSR_MARKER, LAZY_START_SSR_MARKER } from "../const";
import { isServer } from "../context/is-server-context";
import {
  getLazyID,
  initializeLazyScope,
  regsterAsyncGetterFromLazy,
} from "../context/lazy-context";
import { registerSsrModule } from "../context/ssr-module-context";
import { $computed } from "../reactivity/computed";
import { $cmpnt, $nodes } from "../render";
import { createSSRComment } from "../render/resolve-node";

type AnyComponent = (props: never) => JSX.Element;

type ComponentExport<
  M extends Record<string, unknown>,
  K extends keyof M,
> = M[K] extends AnyComponent ? M[K] : never;

/**
 * Lazily loads a component.
 *
 * The module-loading promise is shared across all instances created
 * from this lazy declaration. Each instance retains its own eager $computed
 * value so Vynn's existing Await and hydration integration remain intact.
 */
export function lazy<M extends Record<string, unknown>, K extends keyof M>(
  loader: () => Promise<M>,
  namedExport: K,
  moduleId?: string,
): ComponentExport<M, K>;
export function lazy<M extends Record<string, unknown> & { default: AnyComponent }>(
  loader: () => Promise<M>,
  namedExport?: undefined,
  moduleId?: string,
): M["default"];
export function lazy<M extends Record<string, unknown>, K extends keyof M = "default" & keyof M>(
  loader: () => Promise<M>,
  namedExport = "default" as K,
  moduleId?: string,
): ComponentExport<M, K> {
  type Component = ComponentExport<M, K>;

  let resolvedComponent: Component | undefined;
  let componentPromise: Promise<Component> | undefined;

  async function loadComponent(): Promise<Component> {
    if (resolvedComponent) return resolvedComponent;

    if (!componentPromise) {
      componentPromise = loader()
        .then((module) => {
          const component = module[namedExport] as Component | undefined;

          if (typeof component !== "function") {
            throw new Error(`[vynn]: lazy() export "${String(namedExport)}" is not a component.`);
          }

          resolvedComponent = component;
          return component;
        })
        .catch((error: unknown) => {
          componentPromise = undefined;
          throw error;
        });
    }

    return componentPromise;
  }

  const LazyComponent = $cmpnt(function LazyComponent(
    props: Parameters<Component>[0],
  ): JSX.Element {
    const lazyID = getLazyID();

    // Descendant lazy marker IDs use this scope. Async resources derive their
    // hydration IDs from this component's owner.
    initializeLazyScope(lazyID);

    if (isServer()) {
      registerSsrModule(moduleId);
      regsterAsyncGetterFromLazy(loadComponent);
      const component = $computed(loadComponent);

      return $nodes(() => {
        return [
          createSSRComment(`${LAZY_START_SSR_MARKER}:${lazyID}`),
          component.value(props),
          createSSRComment(`${LAZY_END_SSR_MARKER}:${lazyID}`),
        ] as JSX.Element;
      });
    }

    const existingRange = getServerRenderedLazyRange(lazyID);

    // Route transitions can preload a destination module before replacing the
    // current view. Render that resolved component synchronously so the new
    // outlet does not briefly mount as an empty lazy range.
    if (resolvedComponent && !existingRange) {
      return resolvedComponent(props);
    }

    regsterAsyncGetterFromLazy(loadComponent);

    // Install the scope before creating $nodes. Its initial render effect and
    // every later retry must capture this lazy instance's independent queues.
    const component = $computed(loadComponent);

    return withServerRenderedLazy(lazyID, () =>
      $nodes(() => {
        const rendered = component.value(props);
        finishServerRenderedLazy(lazyID);
        return rendered;
      }, existingRange),
    );
  });

  // Routers can wait for the module before committing a route transition.
  // Keep this out of the public component type; it is an internal capability.
  Object.defineProperty(LazyComponent, "preload", {
    value: loadComponent,
  });

  return LazyComponent as Component;
}
