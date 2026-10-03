import type { JSX } from "../types/jsx";
import { $async } from "..";
import { $dyn } from "../render";

type AnyComponent = (props: never) => JSX.Element;

type ComponentExport<
  M extends Record<string, unknown>,
  K extends keyof M,
> = M[K] extends AnyComponent ? M[K] : never;

/**
 * Lazily loads a component from a dynamically imported module.
 *
 * The component is not loaded until it is rendered. While the module is
 * loading, the returned component integrates with Suspense through `$async`.
 *
 * @template M The type of the dynamically imported module.
 * @template K The name of the export containing the component.
 * @param loader A function that dynamically imports the component module.
 * @param namedExport The name of the component export to load.
 * @returns A component that loads and renders the requested export lazily.
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

  return ((props: Parameters<Component>[0]): JSX.Element => {
    const s = $async(async () => {
      const components = await loader();
      const component = components[namedExport];

      if (typeof component !== "function") {
        throw new Error(
          `lazy(): export "${String(namedExport)}" is not a component.`,
        );
      }

      return component as Component;
    });

    return $dyn(() => s.value(props));
  }) as Component;
}
