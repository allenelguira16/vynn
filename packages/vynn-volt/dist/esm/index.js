import { serverFunctions } from '@vinxi/server-functions/plugin';
import path from 'path';
import { createApp } from 'vinxi';
import vynn from 'vite-plugin-vynn';
import tsconfigPaths from 'vite-tsconfig-paths';
import fs from 'node:fs';
import { BaseFileSystemRouter, cleanPath } from 'vinxi/fs-router';

class VynnFileSystemRouter extends BaseFileSystemRouter {
  toPath(filePath) {
    if (!/page\.(t|j)sx?$/.test(path.basename(filePath))) {
      return "";
    }
    const routePath = cleanPath(filePath, this.config).replace(/\/page$/, "").replace(/\[([^/]+)\]/g, (_, m) => {
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
  return createApp({
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
        plugins: () => [serverFunctions.client(), vynn({ ssr: true }), tsconfigPaths(), ...plugins],
        routes: fileSystemRouter({ dir: path.resolve(rootDir, "./src/app") })
      },
      serverFunctions.router({ plugins: () => [tsconfigPaths()] })
    ]
  });
}

export { defineConfig };
//# sourceMappingURL=index.js.map
