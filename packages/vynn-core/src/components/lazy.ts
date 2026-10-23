import type { JSX } from "../types/jsx";
import { $async } from "../reactivity/$async";
import { $cmpnt, $nodes } from "../render";
import { getRenderMode } from "../context/render-mode";
import { createSSRComment } from "../render/resolve-node";
import {
  syncServerRenderedLazy,
  isHydrating,
  runAfterHydration,
  finishServerRenderedLazy,
} from "../render/hydration";
import { $state } from "../reactivity/$state";
import { LAZY_END_SSR_MARKER, LAZY_START_SSR_MARKER } from "../const";
import { getLazyID } from "../context/lazy-id";

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
): ComponentExport<M, K>;
export function lazy<
  M extends Record<string, unknown> & { default: AnyComponent },
>(loader: () => Promise<M>): M["default"];
export function lazy<
  M extends Record<string, unknown>,
  K extends keyof M = "default" & keyof M,
>(
  loader: () => Promise<M>,
  namedExport = "default" as K,
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

    loadPromise = Promise.resolve(modulePromise).then((module) => {
      const component = module[namedExport];

      if (typeof component !== "function") {
        throw new Error(
          `[vynn]: lazy() export "${String(namedExport)}" is not a component.`,
        );
      }

      return component as Component;
    });

    if (!getRenderMode()) Object.assign(loadPromise, { __lazy: true });
    return loadPromise;
  }

  return $cmpnt(function LazyComponent(
    props: Parameters<Component>[0],
  ): JSX.Element {
    return withLazyBoundary(() => {
      const component = $async(loadComponent);

      // console.log(getCurrentOwner());
      const lazyID = getLazyID();

      // The server does not wait for client hydration.
      const hydrationReady = $state(!!getRenderMode() || !isHydrating());

      // Schedule exactly one transition for this instance.
      if (!getRenderMode() && !hydrationReady.value) {
        runAfterHydration(() => {
          hydrationReady.value = true;
        }, false);
      }

      return $nodes(() => {
        if (getRenderMode()) {
          return [
            createSSRComment(`${LAZY_START_SSR_MARKER}:${lazyID}`),
            component.value(props),
            createSSRComment(`${LAZY_END_SSR_MARKER}:${lazyID}`),
          ] as JSX.Element;
        }

        if (!hydrationReady.value) {
          return [];
        }

        if (!cachedComponent) {
          cachedComponent = component.value;
        }

        syncServerRenderedLazy(lazyID);

        try {
          return cachedComponent(props);
        } finally {
          finishServerRenderedLazy(lazyID);
        }
      });
    });
  }) as Component;
}

let isInsideLazyBoundary = false;

export function isInsideLazy() {
  return isInsideLazyBoundary;
}

export function withLazyBoundary<T>(callback: () => T) {
  isInsideLazyBoundary = true;

  try {
    return callback();
  } finally {
    isInsideLazyBoundary = false;
  }
}
