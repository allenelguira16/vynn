import type { Plugin } from "vite";

import {
  transformVynnRenderNewOxcWithMap,
  type RenderNewCompilerOptions,
} from "vynn-compiler/render-new";

export type VynnRenderNewOxcPluginOptions = RenderNewCompilerOptions & {
  /** Set false to disable the transform for matching files. */
  enabled?: boolean;
};

/**
 * Opt-in Vite adapter for the independent render_new compiler target.
 *
 * This is intentionally a separate plugin from vynnOxcPlugin(): applications
 * keep using the legacy renderer unless they explicitly select this target.
 */
export function vynnRenderNewOxcPlugin(
  options: VynnRenderNewOxcPluginOptions = {},
): Plugin {
  const { enabled, ...compilerOptions } = options;

  return {
    name: "vynn-render-new-jsx",
    enforce: "pre",
    transform(source, id) {
      if (enabled === false) return null;
      if (id.includes("node_modules") || id.startsWith("\0")) return null;

      const cleanId = id.split("?", 1)[0];
      if (!/\.(?:[cm]?[jt]sx?)$/i.test(cleanId)) return null;
      if (!source.includes("<")) return null;

      const result = transformVynnRenderNewOxcWithMap(
        source,
        cleanId,
        compilerOptions,
      );

      return {
        code: result.code,
        map: result.map,
      };
    },
  };
}
