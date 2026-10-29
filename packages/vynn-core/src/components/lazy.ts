import type { JSX } from "../types/jsx";
import { $async } from "../reactivity/$async";
import { $cmpnt, $nodes } from "../render";
import { createSSRComment } from "../render/resolve-node";
import {
  getServerRenderedLazyRange,
  syncServerRenderedLazy,
  // isHydrating,
  // runAfterHydration,
  finishServerRenderedLazy,
} from "../client/hydration";
// import { $state } from "../reactivity/$state";
import { LAZY_END_SSR_MARKER, LAZY_START_SSR_MARKER } from "../const";
import {
  getLazyID,
  registerPromiseFromLazy,
  regsterAsyncGetterFromLazy,
} from "../context/lazy-context";
import { isServer } from "../context/is-server-context";

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

    loadPromise = Promise.resolve(modulePromise).then(async (module) => {
      const component = module[namedExport];

      if (typeof component !== "function") {
        throw new Error(
          `[vynn]: lazy() export "${String(namedExport)}" is not a component.`,
        );
      }

      return component as Component;
    });

    if (!isServer()) registerPromiseFromLazy(loadPromise);

    return loadPromise;
  }

  return $cmpnt(function LazyComponent(
    props: Parameters<Component>[0],
  ): JSX.Element {
    // The ID belongs to this component instance, not the lazy declaration.
    const lazyID = getLazyID();

    // return withLazyBoundary(() => {
    regsterAsyncGetterFromLazy(loadComponent);
    const component = $async(loadComponent);
    const existingRange = isServer()
      ? undefined
      : getServerRenderedLazyRange(lazyID);

    // // The server does not wait for client hydration.
    // const hydrationReady = $state(!!isServer() || !isHydrating());

    // // Schedule exactly one transition for this instance.
    // if (!isServer() && !hydrationReady.value) {
    //   runAfterHydration(() => {
    //     hydrationReady.value = true;
    //   }, false);
    // }

    return $nodes(() => {
      if (isServer()) {
        return [
          createSSRComment(`${LAZY_START_SSR_MARKER}:${lazyID}`),
          component.value(props),
          createSSRComment(`${LAZY_END_SSR_MARKER}:${lazyID}`),
        ] as JSX.Element;
      }

      // if (!hydrationReady.value) {
      //   return [];
      // }

      if (!cachedComponent) {
        cachedComponent = component.value;
      }

      syncServerRenderedLazy(lazyID);

      try {
        return cachedComponent(props);
      } finally {
        finishServerRenderedLazy(lazyID);
      }
    }, existingRange);
    // });
  }) as Component;
}

// const LAZY_BOUNDARY = Symbol("vynn.lazy-boundary");

// export function isInsideLazy() {
//   return getContext<boolean>(LAZY_BOUNDARY) ?? false;
// }

// /**
//  * Marks the current component owner as a lazy boundary.
//  *
//  * Unlike a module-level flag, owner context survives deferred SSR retries
//  * and async reactive effects, without leaking into sibling component trees.
//  */
// export function withLazyBoundary<T>(callback: () => T) {
//   if (!getOwner()) {
//     throw new Error("[vynn]: A lazy boundary requires an active component owner.");
//   }

//   setContext(LAZY_BOUNDARY, true);
//   return callback();
// }
