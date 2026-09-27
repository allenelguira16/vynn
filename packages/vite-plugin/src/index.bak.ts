import { transformSync } from "@babel/core";
import babelPluginTS from "@babel/preset-typescript";
import babelPluginVynn from "@babel/preset-vynn";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin, ViteDevServer } from "vite";

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

  if (options.ssr) {
    const virtualCssPath = "/@virtual:ssr-css.css";

    // Keep styles scoped to this plugin instance.
    const collectedStyles = new Map<string, string>();

    plugins.push({
      name: "ssr-dev-fouc-fix",
      apply: "serve",

      // Gather CSS contents as they are transformed.
      transform(code, id) {
        if (id.includes("node_modules")) {
          return null;
        }

        if (/\.css(?:\?|$)/.test(id)) {
          collectedStyles.set(id, code);
        }

        return null;
      },

      // Update collected CSS on HMR.
      handleHotUpdate(ctx) {
        const { file, read } = ctx;

        if (/\.css(?:\?|$)/.test(file)) {
          return Promise.resolve(read()).then((code) => {
            collectedStyles.set(file, code);
          });
        }
      },

      // Serve a virtual stylesheet containing the collected styles.
      configureServer(server: ViteDevServer) {
        server.middlewares.use(
          (req: IncomingMessage, res: ServerResponse, next) => {
            if (req.url === virtualCssPath) {
              res.setHeader("Content-Type", "text/css");
              res.statusCode = 200;
              res.end(Array.from(collectedStyles.values()).join("\n"));
              return;
            }

            next();
          },
        );
      },

      // Inject one stylesheet link into the HTML head.
      transformIndexHtml: {
        order: "pre",

        handler: () => [
          {
            tag: "link",
            injectTo: "head",
            attrs: {
              rel: "stylesheet",
              href: virtualCssPath,
            },
          },
        ],
      },
    });
  }

  return plugins;
};
