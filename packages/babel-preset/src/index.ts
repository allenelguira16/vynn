import type { PresetAPI, PresetObject } from "@babel/core";
import plugin from "./plugins/reactive-plugin.ts";

type BabelPresetVynnOptions = {
  // ssr?: boolean;
};

/**
 * babel preset for vynn
 *
 * @param api - The babel api.
 * @returns The babel options.
 */
export default function babelPresetVynn(
  api: PresetAPI,
  opts: BabelPresetVynnOptions,
): PresetObject {
  api.assertVersion(8);

  return {
    plugins: ["@babel/plugin-syntax-jsx", [plugin, opts]],
  };
}
