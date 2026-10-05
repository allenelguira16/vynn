import { transformSync } from "@babel/core";
import babelPluginTS from "@babel/preset-typescript";
import babelPluginVynn from "@babel/preset-vynn";
import type { Plugin } from "vite";

type VitePluginVynnOptions = {
  ssr?: boolean;
};

/**
 * Vite plugin for Vynn.
 *
 * @param options - Vynn plugin options.
 * @returns The Vite plugins.
 */
export default (options: VitePluginVynnOptions = { ssr: false }): Plugin[] => {
  const plugins: Plugin[] = [];

  plugins.push({
    name: "vite-plugin-vynn",
    enforce: "pre",

    transform: {
      filter: {
        id: /\.[tj]sx?(?:$|\?)/,
      },

      handler(code, id, transformOptions) {
        const [filename] = id.split("?", 2);

        const isSSR = transformOptions?.ssr === true;

        // Plugin is client-only.
        // Don't transform SSR modules if SSR wasn't enabled.
        if (isSSR && !options.ssr) {
          return null;
        }

        const result = transformSync(code, {
          filename,
          sourceMaps: true,

          presets: [
            [
              babelPluginVynn,
              {
                ssr: isSSR,

                // Vite's module ID is passed to Vynn so the generated
                // HMR handler can identify the module correctly.
                //
                // HMR is only relevant to client transforms.
                hmrId: isSSR ? undefined : filename,
              },
            ],
            babelPluginTS,
          ],

          generatorOpts: {
            comments: true,
            shouldPrintComment: (value: string) => /#__PURE__/.test(value),
          },
        });

        if (!result?.code) {
          return null;
        }

        return {
          code: result.code,
          map: result.map ? JSON.stringify(result.map) : undefined,
          moduleType: "js",
        };
      },
    },
  });

  return plugins;
};
