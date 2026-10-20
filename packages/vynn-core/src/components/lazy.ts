import type { JSX } from "../types/jsx";
import { $async } from "../reactivity/$async";
import { $cmpnt, $dyn } from "../render";

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

    return loadPromise;
  }

  return $cmpnt(function LazyComponent(
    props: Parameters<Component>[0],
  ): JSX.Element {
    const component = $async(loadComponent);

    return $dyn(() => {
      if (!cachedComponent) {
        cachedComponent = component.value;
      }

      return cachedComponent(props);
    });
  }) as Component;
}
