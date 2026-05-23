/// <reference types="vinxi/types/client" />
// @ts-expect-error no type
import { serverFunctions } from "@vinxi/server-functions/plugin";
import path from "path";
import { AppOptions, createApp } from "vinxi";
import { PluginOption } from "vite";
import vynn from "vite-plugin-vynn";
import tsconfigPaths from "vite-tsconfig-paths";

import { fileSystemRouter } from "./file-system-router";

type DefineConfig = {
  plugins: PluginOption[];
  server?: AppOptions["server"];
};

/**
 * Defining Configuration for @vynn/volt application
 *
 * @param config
 * @returns vinxi createApp
 */
export function defineConfig({ plugins, server = {} }: DefineConfig) {
  const rootDir = process.cwd();
  return createApp({
    devtools: true,
    server: {
      compressPublicAssets: {
        brotli: process.versions.bun ? false : true,
      },
      routeRules: {
        "/_build/assets/**": {
          headers: { "cache-control": "public, immutable, max-age=31536000" },
        },
      },
      experimental: {
        asyncContext: true,
      },
      ...server,
    },
    routers: [
      {
        name: "public",
        type: "static",
        dir: path.resolve(rootDir, "./public"),
        base: "/",
      },
      {
        name: "ssr",
        type: "http",
        base: "/",
        target: "server",
        handler: path.resolve(rootDir, "./src/entry-server.tsx"),
        plugins: () => [vynn({ ssr: true }), tsconfigPaths(), ...plugins],
        routes: fileSystemRouter({ dir: path.resolve(rootDir, "./src/app") }),
        link: {
          client: "client",
        },
      },
      {
        name: "client",
        type: "client",
        base: "/_build",
        target: "browser",
        handler: path.resolve(rootDir, "./src/entry-client.tsx"),
        plugins: () => [serverFunctions.client(), vynn({ ssr: true }), tsconfigPaths(), ...plugins],
        routes: fileSystemRouter({ dir: path.resolve(rootDir, "./src/app") }),
      },
      serverFunctions.router({ plugins: () => [tsconfigPaths()] }),
    ],
  });
}
