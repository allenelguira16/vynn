import "./virtual.d.ts";
import type { Plugin } from "vite";
import type { RenderMode } from "vynn";

import { vynnAppPlugin } from "./plugins/app/index.ts";
import { vynnOxcPlugin } from "./plugins/jsx-transpiler.ts";
import { vynnNodeAdapterPlugin } from "./plugins/node-adapter.ts";
import {
  type VynnServerFunctionsOptions,
  serverFunctionsPlugin,
} from "./plugins/server-functions/index.ts";
import { createVynnSsrCssPlugin } from "./plugins/ssr-css.ts";
import { vynnSsrPreloadPlugin } from "./plugins/ssr-preload.ts";

/**
 * Configuration for the integrated Vynn application.
 *
 * Application handling is always enabled and follows the conventional
 * application paths and document defaults.
 */
export type VynnPluginOptions = {
  /** Enable server rendering and automatic hydration. */
  ssr?: boolean;
  /** SSR render mode. Defaults to "stream". */
  ssrMode?: RenderMode;
  /** Enable "use server" RPC handling. */
  serverFunctions?: boolean | VynnServerFunctionsOptions;
};

/**
 * Vite plugin for Vynn.
 *
 * Application handling is integrated and enabled by default. Calling vynn()
 * discovers the conventional application entry and provides document serving,
 * client builds, and hydration. Add ssr: true for server rendering.
 *
 * Server functions are optional and can also be used without SSR.
 */
export default function vynn(options: VynnPluginOptions = {}) {
  const plugins: Plugin[] = [vynnOxcPlugin()];

  const ssrCss = options.ssr ? createVynnSsrCssPlugin() : undefined;
  const ssrPreload = options.ssr ? vynnSsrPreloadPlugin() : undefined;
  const serverFunctionsOptions =
    options.serverFunctions === true ? {} : options.serverFunctions || undefined;

  if (options.serverFunctions) {
    plugins.push(serverFunctionsPlugin(serverFunctionsOptions));
  }

  if (ssrCss) {
    plugins.push(ssrCss.plugin);
  }

  if (ssrPreload) {
    plugins.push(ssrPreload);
  }

  plugins.push(
    vynnAppPlugin({
      ssr: options.ssr === true,
      ssrMode: options.ssrMode ?? "stream",
      ssrCss,
      serverFunctions:
        options.serverFunctions && serverFunctionsOptions?.enabled !== false
          ? serverFunctionsOptions
          : undefined,
    }),
  );

  if (options.ssr) {
    plugins.push(vynnNodeAdapterPlugin());
  }

  return plugins;
}

/** Standalone server-function integration for Vite projects. */
export function serverFunctions(options: VynnServerFunctionsOptions = {}) {
  return serverFunctionsPlugin(options);
}

export type { VynnServerFunctionsOptions };
