import type { JSX } from "../types/jsx";

import {
  finishServerRenderedLazy,
  getServerRenderedLazyRange,
  withServerRenderedLazy,
} from "../client/hydration";
import { LAZY_END_SSR_MARKER, LAZY_START_SSR_MARKER } from "../const";
import { initializeLazyAsyncScope } from "../context/async-context";
import { isServer } from "../context/is-server-context";
import {
  getLazyID,
  initializeLazyScope,
  registerPromiseFromLazy,
  regsterAsyncGetterFromLazy,
} from "../context/lazy-context";
import { registerSsrModule } from "../context/ssr-module-context";
import { $async } from "../reactivity/$async";
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
 * from this lazy declaration. Each instance retains its own $async
 * state so Vynn's existing Await integration remains intact.
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

  let cachedComponent: Component | undefined;
  let loadPromise: Promise<Component> | undefined;

  function loadComponent(): Promise<Component> {
    if (loadPromise) {
      return loadPromise;
    }

    let modulePromise: Promise<M>;

    try {
      modulePromise = loader();
    } catch (error) {
      modulePromise = Promise.reject(error);
    }

    loadPromise = Promise.resolve(modulePromise).then(async (module) => {
      const component = module[namedExport];

      if (typeof component !== "function") {
        throw new Error(`[vynn]: lazy() export "${String(namedExport)}" is not a component.`);
      }

      return component as Component;
    });

    if (!isServer()) registerPromiseFromLazy(loadPromise);

    return loadPromise;
  }

  return $cmpnt(function LazyComponent(props: Parameters<Component>[0]): JSX.Element {
    const lazyID = getLazyID();

    // Descendant lazy and async identities are scoped to this instance.
    initializeLazyScope(lazyID);
    initializeLazyAsyncScope(lazyID);

    if (isServer()) registerSsrModule(moduleId);

    regsterAsyncGetterFromLazy(loadComponent);
    const component = $async(loadComponent);

    if (isServer()) {
      return $nodes(() => {
        if (!cachedComponent) {
          cachedComponent = component.value;
        }

        return [
          createSSRComment(`${LAZY_START_SSR_MARKER}:${lazyID}`),
          cachedComponent(props),
          createSSRComment(`${LAZY_END_SSR_MARKER}:${lazyID}`),
        ] as JSX.Element;
      });
    }

    const existingRange = getServerRenderedLazyRange(lazyID);

    // Install the scope before creating $nodes. Its initial render effect and
    // every later retry must capture this lazy instance's independent queues.
    return withServerRenderedLazy(lazyID, () =>
      $nodes(() => {
        if (!cachedComponent) {
          cachedComponent = component.value;
        }

        const rendered = cachedComponent(props);
        finishServerRenderedLazy(lazyID);
        return rendered;
      }, existingRange),
    );
  }) as Component;
}
