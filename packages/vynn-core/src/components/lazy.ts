import type { JSX } from "../types/jsx";
import { $async } from "../reactivity/$async";
import { $cmpnt, $dyn } from "../render";
import { getRenderMode } from "../context/render-mode";
import { createSSRComment } from "../render/resolve-node";
import { getOwnerContext, modifyOwnerContext } from "../life-cycle/owner";
import {
  syncServerRenderedLazy,
  isHydrating,
  runAfterHydration,
} from "../render/hydration";
import { $state } from "../reactivity/$state";
import { $renderEffect } from "../reactivity/$effect";

type AnyComponent = (props: never) => JSX.Element;

type ComponentExport<
  M extends Record<string, unknown>,
  K extends keyof M,
> = M[K] extends AnyComponent ? M[K] : never;

const NativePromise = globalThis.Promise;

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
      modulePromise = NativePromise.reject(error);
    }

    loadPromise = NativePromise.resolve(modulePromise).then((module) => {
      const component = module[namedExport];

      if (typeof component !== "function") {
        throw new Error(
          `lazy(): export "${String(namedExport)}" is not a component.`,
        );
      }

      return component as Component;
    });

    Object.assign(loadPromise, { __lazy: true });
    return loadPromise;
  }

  return $cmpnt(function LazyComponent(
    props: Parameters<Component>[0],
  ): JSX.Element {
    return withLazyBoundary(() => {
      const component = $async(loadComponent);

      const lazyID = getOwnerContext<number>("$lazy-id") ?? 0;
      modifyOwnerContext<number>("$lazy-id", (currentID) => currentID + 1);

      // The server does not wait for client hydration.
      const hydrationReady = $state(!!getRenderMode() || !isHydrating());

      // Schedule exactly one transition for this instance.
      if (!getRenderMode() && !hydrationReady.value) {
        runAfterHydration(() => {
          // console.log(getServerRenderedLazy());
          hydrationReady.value = true;
        });
      }

      // getServerRenderedLazy(lazyID);

      return $dyn(() => {
        // Preserve the existing SSR boundary markers.
        if (getRenderMode()) {
          // if (!cachedComponent) {
          //   cachedComponent = component.value;
          // }

          return [
            createSSRComment(`lazy:${lazyID}`),
            component.value(props),
            createSSRComment(`/lazy:${lazyID}`),
          ] as JSX.Element;
        }

        // Do not claim any server-rendered nodes during root hydration.
        if (!hydrationReady.value) {
          return [];
        }

        // Wait for the module only after hydration is finished.
        if (!cachedComponent) {
          cachedComponent = component.value;
        }

        console.log(lazyID);
        syncServerRenderedLazy(lazyID);

        return cachedComponent(props);
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
