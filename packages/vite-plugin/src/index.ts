import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin, ViteDevServer } from "vite";
import { vynnOxcPlugin } from "./vynn-oxc-plugin.ts";
import { vynnStartPlugin, type VynnStartOptions } from "./start/index.ts";

type VitePluginVynnOptions = {
  /** Enable SSR compiler/runtime integration for manually wired SSR projects or Start mode. */
  ssr?: boolean;
  /** Own entries, HTML serving, and build orchestration. `true` uses conventions. */
  start?: boolean | VynnStartOptions;
};

/**
 * Vite plugin for Vynn.
 *
 * `start: true` adds Solid-like Start mode. Pair it with `ssr: true` for
 * streamed SSR, automatic hydration, multi-environment builds, and SSR in
 * `vite preview`. Without `start`, the existing low-level plugin behavior is
 * retained.
 */
export default function vynn(options: VitePluginVynnOptions = {}) {
  const plugins: Plugin[] = [vynnOxcPlugin()];
  const startEnabled = options.start !== undefined && options.start !== false;

  // if (options.ssr) {
  //   const virtualCssPath = "/@virtual:ssr-css.css";
  //   const collectedStyles = new Map<string, string>();

  //   plugins.push({
  //     name: "ssr-dev-fouc-fix",
  //     apply: "serve",

  //     transform(code, id) {
  //       if (id.includes("node_modules")) return null;
  //       if (/\.css(?:\?|$)/.test(id)) collectedStyles.set(id, code);
  //       return null;
  //     },

  //     handleHotUpdate(ctx) {
  //       const { file, read } = ctx;
  //       if (!/\.css(?:\?|$)/.test(file)) return;
  //       return Promise.resolve(read()).then((code) => {
  //         collectedStyles.set(file, code);
  //       });
  //     },

  //     configureServer(server: ViteDevServer) {
  //       server.middlewares.use(
  //         (req: IncomingMessage, res: ServerResponse, next) => {
  //           const pathname = new URL(req.url ?? "/", "http://vynn.local")
  //             .pathname;
  //           const base = server.config.base || "/";
  //           const basePath = base.startsWith("/")
  //             ? base.replace(/\/$/, "")
  //             : "";
  //           const normalizedPath =
  //             basePath && pathname.startsWith(`${basePath}/`)
  //               ? pathname.slice(basePath.length)
  //               : pathname;

  //           if (normalizedPath !== virtualCssPath) {
  //             next();
  //             return;
  //           }

  //           res.setHeader("Content-Type", "text/css; charset=utf-8");
  //           res.statusCode = 200;
  //           res.end(Array.from(collectedStyles.values()).join("\n"));
  //         },
  //       );
  //     },

  //     // Low-level SSR users still use index.html. Start mode creates its own
  //     // shell, so it links this endpoint from the generated document instead.
  //     ...(startEnabled
  //       ? {}
  //       : {
  //           transformIndexHtml: {
  //             order: "pre" as const,
  //             handler: () => [
  //               {
  //                 tag: "link",
  //                 injectTo: "head" as const,
  //                 attrs: {
  //                   rel: "stylesheet",
  //                   href: virtualCssPath,
  //                 },
  //               },
  //             ],
  //           },
  //         }),
  //   });
  // }

  if (startEnabled) {
    plugins.push(
      vynnStartPlugin({
        ssr: options.ssr === true,
        start:
          options.start === true ? {} : (options.start as VynnStartOptions),
      }),
    );
  }

  return plugins;
}

export type { VynnStartOptions } from "./start/index.ts";
