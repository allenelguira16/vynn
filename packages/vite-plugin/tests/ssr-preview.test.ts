import { describe, expect, it } from "vitest";

import type { PreviewServer, ResolvedConfig } from "vite";

import { vynnAppPlugin } from "../src/plugins/app/index.ts";

describe("Vynn SSR preview integration", () => {
  it("installs the SSR preview middleware with Vite's default SSR environment", () => {
    const plugin = vynnAppPlugin({
      ssr: true,
      ssrMode: "stream",
    });
    const config = {
      root: process.cwd(),
      base: "/",
      command: "serve",
      plugins: [],
      environments: {
        client: {
          build: { outDir: "dist/client" },
        },
        ssr: {
          consumer: "server",
          build: { outDir: "dist/server" },
          // Vite 8 supplies this factory by default for the built-in SSR
          // environment. It must not make Vynn yield preview request handling.
          dev: { createEnvironment: () => ({}) },
        },
      },
    } as unknown as ResolvedConfig;

    const configResolved = plugin.configResolved as (config: ResolvedConfig) => void;
    configResolved.call(plugin, config);

    const configurePreviewServer = plugin.configurePreviewServer as (
      server: PreviewServer,
    ) => unknown;
    const postHook = configurePreviewServer.call(plugin, {} as PreviewServer);

    expect(postHook).toBeTypeOf("function");
  });

  it("leaves preview request handling to an external deployment", () => {
    const plugin = vynnAppPlugin({
      ssr: true,
      ssrMode: "stream",
    });
    const config = {
      root: process.cwd(),
      base: "/",
      command: "serve",
      plugins: [
        {
          name: "example-deployment",
          buildApp: { handler: async () => {} },
        },
      ],
      environments: {
        client: {
          build: { outDir: "dist/client" },
        },
        ssr: {
          consumer: "server",
          build: { outDir: "dist/server" },
          dev: { createEnvironment: () => ({}) },
        },
      },
    } as unknown as ResolvedConfig;

    const configResolved = plugin.configResolved as (config: ResolvedConfig) => void;
    configResolved.call(plugin, config);

    const configurePreviewServer = plugin.configurePreviewServer as (
      server: PreviewServer,
    ) => unknown;
    expect(configurePreviewServer.call(plugin, {} as PreviewServer)).toBeUndefined();
  });
});
