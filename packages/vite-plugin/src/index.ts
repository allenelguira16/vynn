import type { Plugin } from "vite";
import { vynnOxcPlugin } from "./vynn-oxc-plugin.ts";
import { vynnStartPlugin, type VynnAppOptions } from "./plugins/app.ts";
import { createVynnSsrCssPlugin } from "./plugins/ssr-css.ts";

type VitePluginVynnOptions = {
  /** Enable SSR compiler/runtime integration for manually wired SSR projects or Start mode. */
  ssr?: boolean;
  /** Own entries, HTML serving, and build orchestration. `true` uses conventions. */
  app?: boolean | VynnAppOptions;
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

  if (ssrCss) {
    plugins.push(ssrCss.plugin);
  }

  if (startEnabled) {
    plugins.push(
      vynnStartPlugin({
        ssr: options.ssr === true,
        start: options.app === true ? {} : (options.app as VynnAppOptions),
        ssrCss,
      }),
    );
  }

  return plugins;
}

export type { VynnStartOptions } from "./app.ts";
