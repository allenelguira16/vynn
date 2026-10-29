/// <reference path="./virtual.d.ts" />

import type { Plugin } from "vite";
import { vynnOxcPlugin } from "./plugins/jsx-transpiler.ts";
import { createLazyModulePreloadScanner } from "./plugins/lazy-module-preload.ts";
import { vynnStartPlugin, type VynnAppOptions } from "./plugins/app.ts";
import { createVynnSsrCssPlugin } from "./plugins/ssr-css.ts";
import {
  serverFunctionsPlugin,
  type VynnServerFunctionsOptions,
} from "./plugins/server-functions.ts";

type VitePluginVynnOptions = {
  /** Enable SSR compiler/runtime integration for manually wired SSR projects or Start mode. */
  ssr?: boolean;
  /** Own entries, HTML serving, and build orchestration. `true` uses conventions. */
  app?: boolean | VynnAppOptions;
  /** Enable `"use server"` RPC independently of Vynn app mode and SSR rendering. */
  serverFunctions?: boolean | VynnServerFunctionsOptions;
};

/**
 * Vite plugin for Vynn.
 *
 * `app` enables Vynn Start mode. Pair it with `ssr: true` for streamed SSR,
 * automatic hydration, multi-environment builds, and SSR in `vite preview`.
 * `serverFunctions` can also be used on its own with a regular Vite app:
 * Vite dev middleware handles RPC requests, and a regular build emits
 * `dist/client` plus a separate `dist/server/server.js` handler bundle that
 * Vite preview can mount automatically.
 */
export default function vynn(options: VitePluginVynnOptions = {}) {
  const startEnabled = options.app !== undefined && options.app !== false;
  const lazyPreload = createLazyModulePreloadScanner();
  const plugins: Plugin[] = [lazyPreload.plugin, vynnOxcPlugin()];

  const ssrCss = options.ssr ? createVynnSsrCssPlugin() : undefined;
  const serverFunctionsOptions =
    options.serverFunctions === true
      ? {}
      : options.serverFunctions || undefined;

  if (options.serverFunctions) {
    plugins.push(
      serverFunctionsPlugin(serverFunctionsOptions, {
        // SSR builds include the handler in the SSR entry itself.
        // Only client-only builds need a separate standalone server bundle.
        standalone:
          options.ssr !== true &&
          serverFunctionsOptions?.enabled !== false,
      }),
    );
  }

  if (ssrCss) {
    plugins.push(ssrCss.plugin);
  }

  if (startEnabled) {
    plugins.push(
      vynnStartPlugin({
        ssr: options.ssr === true,
        start: options.app === true ? {} : (options.app as VynnAppOptions),
        ssrCss,
        serverFunctions:
          options.serverFunctions && serverFunctionsOptions?.enabled !== false
            ? serverFunctionsOptions
            : undefined,
      }),
    );
  }

  return plugins;
}

export type { VynnAppOptions, VynnServerFunctionsOptions };
