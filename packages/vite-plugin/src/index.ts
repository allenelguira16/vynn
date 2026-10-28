/// <reference path="./virtual.d.ts" />

import type { Plugin } from "vite";
import { vynnOxcPlugin } from "./plugins/jsx-transpiler.ts";
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
  serverFunctions?: boolean | VynnServerFunctionsOptions;
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

  const startEnabled = options.app !== undefined && options.app !== false;

  const ssrCss = options.ssr ? createVynnSsrCssPlugin() : undefined;
  const serverFunctionsOptions =
    options.serverFunctions === true
      ? {}
      : options.serverFunctions || undefined;

  if (options.serverFunctions && !options.ssr) {
    throw new Error(
      "[Vynn] serverFunctions requires ssr: true. Server functions execute on the server and cannot be enabled in a client-only build.",
    );
  }

  if (options.serverFunctions) {
    plugins.push(serverFunctionsPlugin(serverFunctionsOptions));
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
