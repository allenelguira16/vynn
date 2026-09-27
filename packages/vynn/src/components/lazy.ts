import { $computed } from "../reactivity/$computed";

/**
 * Lazily load components
 *
 * @param loader lazy loader import
 * @param namedExport name of the exported
 * @returns jsx
 */
export const lazy = <
  M extends Record<string, any>,
  K extends keyof M = "default",
>(
  _loader: () => Promise<M>,
  namedExport = "default" as K,
) => {
  const data = $computed(_loader);

  return (...props: any) => {
    return data.value[namedExport](...props);
  };
};
