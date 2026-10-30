import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type {
  Plugin,
  PreviewServer,
  ResolvedConfig,
  UserConfig,
  ViteDevServer,
} from "vite";
import type { VynnSsrCssCollector, VynnSsrCssLink } from "./ssr-css.ts";
import type { VynnServerFunctionsOptions } from "./server-functions.ts";
import {
  CLIENT_ENTRY_ID,
  SERVER_ENTRY_ID,
  SSR_HANDLER_ID,
  RESOLVED_CLIENT_ENTRY_ID,
  RESOLVED_SERVER_ENTRY_ID,
  RESOLVED_SSR_HANDLER_ID,
  HTML_OUTLET_ID,
  type ClientAssets,
  type ResolvedEntries,
  type VynnAppOptions,
} from "./app/shared.ts";
import { resolveEntries, toAbsoluteSpecifier } from "./app/entries.ts";
import {
  createAuthoredServerEntry,
  createClientEntry,
  createClientShell,
  createServerEntry,
  createSsrHandlerCode,
  readClientAssets,
  readSsrManifest,
} from "./app/documents.ts";
import {
  addBaseToRequestUrl,
  createWebRequest,
  getClientEntryDevUrl,
  isFrameworkRequest,
  isHtmlNavigation,
  joinAssetBase,
  toDevUrl,
  writeResponse,
} from "./app/http.ts";

export { CLIENT_ENTRY_ID, SERVER_ENTRY_ID, SSR_HANDLER_ID };
export type { VynnAppOptions };

function normalizeFilePath(file: string): string {
  const path = resolve(file).replace(/\\/g, "/");
  return process.platform === "win32" ? path.toLowerCase() : path;
}

type PluginOptions = {
  ssr: boolean;
  start: VynnAppOptions;
  ssrCss?: VynnSsrCssCollector;
  serverFunctions?: VynnServerFunctionsOptions;
};

/**
 * App mode plugin
 *
 * - `ssr: true`: Vite owns development SSR, the client/server build, and SSR
 *   dispatch in `vite preview`. The built `virtual:vynn/ssr-handler` exports
 *   `handleRequest(Request)` and a Fetch-compatible default export.
 * - `ssr: false`: Vite serves a client-rendered shell in dev and emits a static
 *   index.html from `vite build`.
 *
 * Neither mode requires a project-owned index.html or HTTP server file.
 */
export function vynnStartPlugin({
  ssr,
  start,
  ssrCss,
  serverFunctions,
}: PluginOptions): Plugin {
  const mount = start.mount ?? `#${HTML_OUTLET_ID}`;
  const title = start.title ?? "Vynn App";

  if (!/^#[A-Za-z_][\w:.-]*$/.test(mount)) {
    throw new Error(
      `[Vynn Start] The mount option must be an ID selector (for example, "#app"); received ${JSON.stringify(mount)}.`,
    );
  }

  const mountId = mount.slice(1);
  let resolvedConfig: ResolvedConfig | undefined;
  let entries = {} as ResolvedEntries;
  let clientOutDir = resolve(process.cwd(), "dist/client");
  let serverOutDir = resolve(process.cwd(), "dist/server");
  let base = "/";
  let isBuild = false;
  let serverFunctionEndpoint = "/__vynn/server-function";
  const root = () => resolvedConfig?.root ?? process.cwd();

  return {
    name: "vynn-app-mode",

    config(userConfig, env): Omit<UserConfig, "plugins"> {
      const projectRoot = resolve(userConfig.root || process.cwd());
      entries = resolveEntries(projectRoot, start, ssr);

      // Vite preview configuration.
      if (env.isPreview) {
        const previewConfig: Omit<UserConfig, "plugins"> = {
          appType: ssr ? "custom" : "spa",
          build: {
            outDir: "dist/client",
          },
        };

        if (ssr) {
          previewConfig.environments = {
            ssr: {
              build: {
                outDir: "dist/server",
              },
            },
          };
        }

        return previewConfig;
      }

      const optimizeEntries = [entries.clientFile, entries.appSpecifier]
        .filter(
          (entry): entry is string =>
            !!entry && isAbsolute(entry) && existsSync(entry),
        )
        .map((entry) => relative(projectRoot, entry).replace(/\\/g, "/"));

      if (ssr) {
        const ssrConfig: Omit<UserConfig, "plugins"> = {
          appType: "custom",
          environments: {
            client: {
              build: {
                outDir: "dist/client",
                manifest: true,
                ssrManifest: true,
                rollupOptions: {
                  input: {
                    client: entries.clientInput,
                  },
                },
              },
            },
            ssr: {
              consumer: "server",
              build: {
                outDir: "dist/server",
                rollupOptions: {
                  input: {
                    index: SSR_HANDLER_ID,
                  },
                  output: {
                    entryFileNames: "index.js",
                  },
                },
              },
            },
          },
        };

        if (env.command === "serve" && optimizeEntries.length > 0) {
          ssrConfig.optimizeDeps = {
            entries: optimizeEntries,
          };
        }

        // Build client and SSR environments together for a regular vite build.
        if (env.command === "build" && !env.isSsrBuild) {
          ssrConfig.builder = {};
        }

        return ssrConfig;
      }

      // Client-only Start configuration.
      const clientConfig: Omit<UserConfig, "plugins"> = {
        appType: "custom",
        build: {
          outDir: "dist/client",
          manifest: true,
          rollupOptions: {
            input: {
              client: entries.clientInput,
            },
          },
        },
      };

      if (env.command === "serve") {
        clientConfig.optimizeDeps = {
          entries: optimizeEntries,
        };
      }

      return clientConfig;
    },

    configEnvironment(name, environmentConfig) {
      if (name !== "ssr" || !ssr) return;

      environmentConfig.consumer = "server";
      environmentConfig.resolve ??= {};

      // Keep Vynn's framework runtime in the same SSR module graph. This is
      // important for owner/context identity when Vynn is workspace-linked.
      const current = environmentConfig.resolve.noExternal;
      if (current !== true) {
        const noExternal =
          current == null ? [] : Array.isArray(current) ? current : [current];
        environmentConfig.resolve.noExternal = [
          ...noExternal,
          "vynn",
          "vynn-router",
        ];
      }
    },

    configResolved(config) {
      resolvedConfig = config;
      base = config.base || "/";
      isBuild = config.command === "build";
      const rawServerFunctionEndpoint =
        serverFunctions?.endpoint ?? "/__vynn/server-function";
      const basePrefix =
        base === "/" || base === "./"
          ? ""
          : base.startsWith("/")
            ? base.replace(/\/+$/, "")
            : "";
      serverFunctionEndpoint = basePrefix
        ? `${basePrefix}${rawServerFunctionEndpoint}`
        : rawServerFunctionEndpoint;

      const environments = (
        config as ResolvedConfig & {
          environments?: Record<string, { build?: { outDir?: string } }>;
        }
      ).environments;
      const clientBuild = environments?.client?.build;
      const serverBuild = environments?.ssr?.build;
      clientOutDir = resolve(
        config.root,
        clientBuild?.outDir ?? config.build.outDir ?? "dist/client",
      );
      serverOutDir = resolve(config.root, serverBuild?.outDir ?? "dist/server");
    },

    resolveId(id) {
      if (id === CLIENT_ENTRY_ID) return RESOLVED_CLIENT_ENTRY_ID;
      if (id === SERVER_ENTRY_ID) return RESOLVED_SERVER_ENTRY_ID;
      if (id === SSR_HANDLER_ID) return RESOLVED_SSR_HANDLER_ID;
      return null;
    },

    async load(id) {
      if (id === RESOLVED_CLIENT_ENTRY_ID) {
        if (!entries.clientIsGenerated || !entries.appSpecifier) return null;
        return createClientEntry(
          entries.appSpecifier,
          entries.styleSpecifiers,
          start.exportName,
          mount,
          ssr,
        );
      }

      if (id === RESOLVED_SERVER_ENTRY_ID) {
        if (!ssr) return null;
        if (entries.serverIsGenerated && entries.appSpecifier) {
          return createServerEntry(
            entries.appSpecifier,
            entries.styleSpecifiers,
            start.exportName,
            start.renderMode ?? "stream",
          );
        }
        if (entries.serverFile) {
          return createAuthoredServerEntry(
            toAbsoluteSpecifier(entries.serverFile),
          );
        }
        return null;
      }

      if (id === RESOLVED_SSR_HANDLER_ID) {
        if (!ssr) {
          this.error(
            `${SSR_HANDLER_ID} is only available when vynn({ start: true, ssr: true }) is enabled.`,
          );
        }

        const consumer = (
          this as unknown as {
            environment?: { config?: { consumer?: string } };
          }
        ).environment?.config?.consumer;

        let assets: ClientAssets | null = null;
        let ssrManifest: Record<string, string[]> | null = null;
        if (isBuild && consumer === "server") {
          assets = await readClientAssets(clientOutDir);
          ssrManifest = await readSsrManifest(clientOutDir);
        }

        const clientEntryUrl = assets
          ? joinAssetBase(base, `/${assets.file}`)
          : getClientEntryDevUrl(entries, root(), base);

        return createSsrHandlerCode({
          clientEntryUrl,
          css: assets?.css ?? [],
          base,
          title,
          mountId,
          dev: !isBuild,
          serverFunctions:
            serverFunctions !== undefined && serverFunctions.enabled !== false,
          ssrManifest,
        });
      }

      return null;
    },

    hotUpdate: {
      order: "post",

      handler({ file, modules, timestamp }) {
        // The root app is rendered by the SSR environment, but the browser
        // DOM is owned by Vynn and does not currently support component HMR.
        // A stylesheet-only HMR update is not enough to apply app.tsx edits.
        // Force a document reload from the client environment instead.
        if (
          !ssr ||
          isBuild ||
          !entries.appSpecifier ||
          !isAbsolute(entries.appSpecifier) ||
          normalizeFilePath(file) !== normalizeFilePath(entries.appSpecifier)
        ) {
          return;
        }

        // The SSR environment must use Vite's normal module propagation.
        // The generated server entry deliberately has no accept boundary, so
        // app.tsx invalidates the server entry and SSR handler as a chain.
        if (this.environment.name !== "client") return;

        // Tailwind may narrow the HMR module list to generated CSS modules.
        // Look up the changed source file directly so app.tsx is invalidated
        // even when the regular update payload only contains stylesheet nodes.
        const graph = this.environment.moduleGraph;
        const appModules = graph.getModulesByFile(file);
        const invalidatedModules = new Set<(typeof modules)[number]>();

        for (const module of appModules ?? modules) {
          graph.invalidateModule(module, invalidatedModules, timestamp, true);
        }

        // Vynn does not yet support replacing the root component's DOM tree.
        // Force the browser to request fresh SSR HTML and hydrate it.
        this.environment.hot.send({ type: "full-reload" });
        return [];
      },
    },

    configureServer(server: ViteDevServer) {
      if (ssr && !isBuild && ssrCss) {
        if (entries.clientFile) {
          // An authored client entry imports its own application and styles.
          ssrCss.registerEntryUrl(toDevUrl(root(), entries.clientFile));
        } else {
          // The generated virtual entry imports the root app and global styles.
          // Register the actual modules instead of relying on the virtual entry URL.
          if (
            entries.appSpecifier &&
            isAbsolute(entries.appSpecifier) &&
            existsSync(entries.appSpecifier)
          ) {
            ssrCss.registerEntryUrl(toDevUrl(root(), entries.appSpecifier));
          } else {
            ssrCss.registerEntryUrl(
              getClientEntryDevUrl(entries, root(), base),
            );
          }

          for (const style of entries.styleSpecifiers) {
            ssrCss.registerEntryUrl(toDevUrl(root(), style));
          }
        }
      }

      // Register the document middleware after Vite's own middlewares so real
      // assets, HMR, and module URLs are given first refusal.
      return () => {
        server.middlewares.use((req, res, next) => {
          if (!isHtmlNavigation(req) || isFrameworkRequest(req.url ?? "/")) {
            next();
            return;
          }

          if (!ssr) {
            writeResponse(
              res,
              new Response(
                createClientShell({
                  base,
                  title,
                  mountId,
                  clientEntryUrl: getClientEntryDevUrl(entries, root(), base),
                  dev: true,
                }),
                {
                  headers: { "content-type": "text/html; charset=utf-8" },
                },
              ),
            ).catch(next);
            return;
          }

          void (async () => {
            const ssrEnvironment = server.environments.ssr as unknown as {
              runner?: { import: (id: string) => Promise<unknown> };
            };
            if (!ssrEnvironment?.runner) {
              throw new Error(
                "[Vynn Start] The Vite SSR environment does not expose a Module Runner. Start mode requires Vite 8's runnable SSR environment.",
              );
            }

            const handler = (await ssrEnvironment.runner.import(
              SSR_HANDLER_ID,
            )) as {
              handleRequest: (
                request: Request,
                cssLinks?: VynnSsrCssLink[],
              ) => Promise<Response>;
            };

            const requestUrl = addBaseToRequestUrl(base, req.url ?? "/");
            const request = createWebRequest(req, requestUrl);
            const cssLinks = ssrCss ? await ssrCss.getCssLinks(server) : [];
            const response = await handler.handleRequest(request, cssLinks);
            await writeResponse(res, response);
          })().catch((error: unknown) => {
            if (res.headersSent) {
              res.destroy(error instanceof Error ? error : undefined);
              return;
            }
            const viteError =
              error instanceof Error ? error : new Error(String(error));
            server.ssrFixStacktrace(viteError);
            next(viteError);
          });
        });
      };
    },

    configurePreviewServer(server: PreviewServer) {
      if (!ssr) return;

      // Vite's preview static middleware gets the first chance to serve built
      // files. Missing paths are dispatched through the built Fetch handler.
      return () => {
        let handlerPromise:
          | Promise<{
              handleRequest: (request: Request) => Promise<Response>;
            }>
          | undefined;

        server.middlewares.use((req, res, next) => {
          const pathname = new URL(req.url ?? "/", "http://vynn.local")
            .pathname;
          const isServerFunctionRequest =
            serverFunctions !== undefined &&
            pathname === serverFunctionEndpoint;
          if (
            (!isHtmlNavigation(req) && !isServerFunctionRequest) ||
            isFrameworkRequest(req.url ?? "/")
          ) {
            next();
            return;
          }

          void (async () => {
            const handlerPath = resolve(serverOutDir, "index.js");
            handlerPromise ??= import(
              /* @vite-ignore */
              pathToFileURL(handlerPath).href
            );
            const handler = await handlerPromise;
            const requestUrl = addBaseToRequestUrl(base, req.url ?? "/");
            const response = await handler.handleRequest(
              createWebRequest(req, requestUrl),
            );
            await writeResponse(res, response);
          })().catch((error: unknown) => {
            if (res.headersSent) {
              res.destroy(error instanceof Error ? error : undefined);
              return;
            }
            next(error);
          });
        });
      };
    },

    async writeBundle(outputOptions) {
      // In client mode, `vite build` produces a static shell without a server
      // bundle. Emit index.html after Vite has written the client manifest.
      if (ssr || this.environment?.config.consumer !== "client") return;

      const outDir = outputOptions.dir
        ? resolve(outputOptions.dir)
        : clientOutDir;
      const assets = await readClientAssets(outDir);
      const shell = createClientShell({
        base,
        title,
        mountId,
        clientEntryUrl: joinAssetBase(base, `/${assets.file}`),
        css: assets.css,
        dev: false,
      });
      await mkdir(outDir, { recursive: true });
      await writeFile(resolve(outDir, "index.html"), shell, "utf8");
    },
  };
}
