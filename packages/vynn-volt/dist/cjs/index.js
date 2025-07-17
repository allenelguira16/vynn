'use strict';

var plugin = require('@vinxi/server-functions/plugin');
var path = require('path');
var vinxi = require('vinxi');
var vynn = require('vite-plugin-vynn');
var tsconfigPaths = require('vite-tsconfig-paths');
var fs = require('node:fs');
var fsRouter = require('vinxi/fs-router');

class VynnFileSystemRouter extends fsRouter.BaseFileSystemRouter {
  toPath(filePath) {
    if (!/page\.(t|j)sx?$/.test(path.basename(filePath))) {
      return "";
    }
    const routePath = fsRouter.cleanPath(filePath, this.config).replace(/\/page$/, "").replace(/\[([^/]+)\]/g, (_, m) => {
      if (m.startsWith("...")) return `*${m.slice(3)}`;
      return `:${m}`;
    });
    return routePath?.length > 0 ? `${routePath}` : "/";
  }
  toRoute(filePath) {
    const routePath = this.toPath(filePath);
    if (!routePath) return null;
    const dir = path.dirname(filePath);
    const layoutFilePath = path.join(dir, "layout.tsx");
    return {
      $$component: {
        src: filePath,
        pick: ["default"]
      },
      ...fs.existsSync(layoutFilePath) ? {
        $$layout: {
          src: layoutFilePath,
          pick: ["default"]
        }
      } : {},
      path: routePath,
      filePath
    };
  }
}
function fileSystemRouter({ dir }) {
  return (router, app) => {
    return new VynnFileSystemRouter(
      {
        dir,
        extensions: ["tsx", "ts", "jsx", "js"]
      },
      router,
      app
    );
  };
}

function defineConfig({ plugins, server = {} }) {
  const rootDir = process.cwd();
  return vinxi.createApp({
    devtools: true,
    server: {
      compressPublicAssets: {
        brotli: process.versions.bun ? false : true
      },
      routeRules: {
        "/_build/assets/**": {
          headers: { "cache-control": "public, immutable, max-age=31536000" }
        }
      },
      experimental: {
        asyncContext: true
      },
      ...server
    },
    routers: [
      {
        name: "public",
        type: "static",
        dir: path.resolve(rootDir, "./public"),
        base: "/"
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
          client: "client"
        }
      },
      {
        name: "client",
        type: "client",
        base: "/_build",
        target: "browser",
        handler: path.resolve(rootDir, "./src/entry-client.tsx"),
        plugins: () => [plugin.serverFunctions.client(), vynn({ ssr: true }), tsconfigPaths(), ...plugins],
        routes: fileSystemRouter({ dir: path.resolve(rootDir, "./src/app") })
      },
      plugin.serverFunctions.router({ plugins: () => [tsconfigPaths()] })
    ]
  });
}

exports.defineConfig = defineConfig;
//# sourceMappingURL=index.js.map
