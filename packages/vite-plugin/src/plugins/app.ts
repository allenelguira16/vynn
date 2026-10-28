import { existsSync } from "node:fs";
import { Readable } from "node:stream";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  Plugin,
  PreviewServer,
  ResolvedConfig,
  UserConfig,
  ViteDevServer,
} from "vite";
import { VYNN_SSR_CSS_URL, type VynnSsrCssCollector } from "./ssr-css.ts";
import type { VynnServerFunctionsOptions } from "./server-functions.ts";

export type VynnAppOptions = {
  /** Root component module, relative to the Vite root. Defaults to src/App.* or src/app.*. */
  app?: string;
  /** Optional named App export. Defaults to `default`, then `App`. */
  exportName?: string;
  /** Conventional client entry override. Defaults to src/entry-client.* when present. */
  entryClient?: string;
  /** Conventional server entry override. Defaults to src/entry-server.* when present in SSR mode. */
  entryServer?: string;
  /** Mount selector for the application. Currently must be an ID selector, such as #app. */
  mount?: string;
  /** HTML document title used by the generated document shell. */
  title?: string;
  /** SSR rendering strategy. @default "stream" */
  renderMode?: "async" | "stream";
};

type PluginOptions = {
  ssr: boolean;
  start: VynnAppOptions;
  ssrCss?: VynnSsrCssCollector;
  serverFunctions?: VynnServerFunctionsOptions;
};

type ResolvedEntries = {
  appSpecifier: string | null;
  styleSpecifiers: string[];
  clientFile: string | null;
  serverFile: string | null;
  clientInput: string;
  clientIsGenerated: boolean;
  serverIsGenerated: boolean;
};

type ManifestEntry = {
  file: string;
  css?: string[];
  isEntry?: boolean;
  name?: string;
};

type ClientAssets = {
  file: string;
  css: string[];
};

export const CLIENT_ENTRY_ID = "virtual:vynn/client-entry";
export const SERVER_ENTRY_ID = "virtual:vynn/server-entry";
export const SSR_HANDLER_ID = "virtual:vynn/ssr-handler";

const RESOLVED_CLIENT_ENTRY_ID = `\0${CLIENT_ENTRY_ID}`;
const RESOLVED_SERVER_ENTRY_ID = `\0${SERVER_ENTRY_ID}`;
const RESOLVED_SSR_HANDLER_ID = `\0${SSR_HANDLER_ID}`;
const DEV_CSS_URL = VYNN_SSR_CSS_URL;
const HTML_OUTLET_ID = "app";
const ENTRY_EXTENSIONS = [
  ".tsx",
  ".jsx",
  ".ts",
  ".js",
  ".tsrx",
  ".mts",
  ".mjs",
];
const CLIENT_ENTRY_NAMES = ["entry-client"];
const SERVER_ENTRY_NAMES = ["entry-server"];

/**
 * Adds Solid-like Start mode to the Vynn Vite plugin.
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
        if (isBuild && consumer === "server") {
          assets = await readClientAssets(clientOutDir);
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
        });
      }

      return null;
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
              handleRequest: (request: Request) => Promise<Response>;
            };

            const requestUrl = addBaseToRequestUrl(base, req.url ?? "/");
            const request = createWebRequest(req, requestUrl);
            const response = await handler.handleRequest(request);
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

function resolveEntries(
  root: string,
  options: VynnAppOptions,
  ssr: boolean,
): ResolvedEntries {
  const clientFile = options.entryClient
    ? resolveUserFile(root, options.entryClient, "entryClient")
    : findConventionalFile(root, CLIENT_ENTRY_NAMES);
  const serverFile = ssr
    ? options.entryServer
      ? resolveUserFile(root, options.entryServer, "entryServer")
      : findConventionalFile(root, SERVER_ENTRY_NAMES)
    : null;

  const needsApp = !clientFile || (ssr && !serverFile);
  const appSpecifier = options.app
    ? toModuleSpecifier(root, options.app)
    : needsApp
      ? findAppSpecifier(root)
      : null;
  const styleSpecifiers = needsApp ? findConventionalStyles(root) : [];

  if (needsApp && !appSpecifier) {
    throw new Error(
      "[Vynn Start] Could not find the root component. Add src/App.tsx (or src/app.tsx), configure start.app, or provide conventional entry-client/entry-server files.",
    );
  }

  return {
    appSpecifier,
    styleSpecifiers,
    clientFile,
    serverFile,
    clientInput: clientFile ?? CLIENT_ENTRY_ID,
    clientIsGenerated: !clientFile,
    serverIsGenerated: ssr && !serverFile,
  };
}

function findAppSpecifier(root: string): string | null {
  const candidates = ["src/App", "src/app"];
  for (const stem of candidates) {
    for (const extension of ENTRY_EXTENSIONS) {
      const file = resolve(root, `${stem}${extension}`);
      if (existsSync(file)) return toAbsoluteSpecifier(file);
    }
  }
  return null;
}

function findConventionalStyles(root: string): string[] {
  // Conventional global styles are included only when Start generates entries.
  // Projects with authored entries remain in full control of their imports.
  return ["src/main.css", "src/index.css"]
    .map((file) => resolve(root, file))
    .filter((file) => existsSync(file))
    .map(toAbsoluteSpecifier);
}

function findConventionalFile(root: string, names: string[]): string | null {
  for (const stem of names) {
    for (const extension of ENTRY_EXTENSIONS) {
      const file = resolve(root, "src", `${stem}${extension}`);
      if (existsSync(file)) return file;
    }
  }
  return null;
}

function resolveUserFile(root: string, value: string, label: string): string {
  const file = resolve(root, value);
  if (!existsSync(file)) {
    throw new Error(`[Vynn Start] start.${label} does not exist: ${value}`);
  }
  return file;
}

function toModuleSpecifier(root: string, value: string): string {
  if (value.startsWith("virtual:") || value.startsWith("@/")) return value;
  if (isAbsolute(value)) {
    // Vite-root paths are a common spelling in plugin configuration. Prefer a
    // real absolute path only when it exists; otherwise treat `/src/X.tsx` as
    // root-relative.
    if (existsSync(value)) return toAbsoluteSpecifier(value);
    const rooted = resolve(root, value.slice(1));
    if (existsSync(rooted)) return toAbsoluteSpecifier(rooted);
    return value.replace(/\\/g, "/");
  }
  if (value.startsWith("./") || value.startsWith("../")) {
    return toAbsoluteSpecifier(resolve(root, value));
  }
  if (value.includes("/") || /\.(?:tsx?|jsx?|tsrx|mjs)$/.test(value)) {
    const file = resolve(root, value);
    if (existsSync(file)) return toAbsoluteSpecifier(file);
    return `/${value.replace(/^\.\//, "").replace(/\\/g, "/")}`;
  }
  return value;
}

function toAbsoluteSpecifier(file: string): string {
  return file.replace(/\\/g, "/");
}

function createClientEntry(
  appSpecifier: string,
  styleSpecifiers: string[],
  exportName: string | undefined,
  mount: string,
  ssr: boolean,
): string {
  // Read optional exports dynamically. A direct `appModule.App` access makes
  // Rollup/Rolldown warn when the module intentionally uses a default export.
  const selected = exportName
    ? `Reflect.get(appModule, ${JSON.stringify(exportName)})`
    : 'Reflect.get(appModule, "default") ?? Reflect.get(appModule, "App")';
  const renderer = ssr ? "hydrateToDOM" : "renderToDOM";

  return [
    ...styleSpecifiers.map((style) => `import ${JSON.stringify(style)};`),
    `import * as appModule from ${JSON.stringify(appSpecifier)};`,
    `import { ${renderer} } from "vynn/client";`,
    `const App = ${selected};`,
    `if (typeof App !== "function") throw new Error("[Vynn Start] The app module must export a component as default or App (or set start.exportName).");`,
    `${renderer}(() => App({ url: window.location.pathname + window.location.search }), ${JSON.stringify(mount)});`,
    "",
  ].join("\n");
}

function createAuthoredServerEntry(serverSpecifier: string): string {
  return [
    `import * as serverModule from ${JSON.stringify(serverSpecifier)};`,
    `if (typeof serverModule.render !== "function") throw new Error("[Vynn Start] The entry-server module must export render(url).");`,
    `export function render(url) { return serverModule.render(url); }`,
    "",
  ].join("\n");
}

function createServerEntry(
  appSpecifier: string,
  styleSpecifiers: string[],
  exportName: string | undefined,
  renderMode: "async" | "stream",
): string {
  // Read optional exports dynamically. A direct `appModule.App` access makes
  // Rollup/Rolldown warn when the module intentionally uses a default export.
  const selected = exportName
    ? `Reflect.get(appModule, ${JSON.stringify(exportName)})`
    : 'Reflect.get(appModule, "default") ?? Reflect.get(appModule, "App")';

  return [
    ...styleSpecifiers.map((style) => `import ${JSON.stringify(style)};`),
    `import * as appModule from ${JSON.stringify(appSpecifier)};`,
    `import { renderToServer } from "vynn/server";`,
    `const App = ${selected};`,
    `if (typeof App !== "function") throw new Error("[Vynn Start] The app module must export a component as default or App (or set start.exportName).");`,
    `export function render(url) {`,
    `  return renderToServer(() => App({ url }), ${JSON.stringify(renderMode)});`,
    `}`,
    "",
  ].join("\n");
}

async function readClientAssets(outDir: string): Promise<ClientAssets> {
  const manifestPath = resolve(outDir, ".vite/manifest.json");
  let manifest: Record<string, ManifestEntry>;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<
      string,
      ManifestEntry
    >;
  } catch (error) {
    throw new Error(
      `[Vynn Start] Could not read the client manifest at ${manifestPath}. The client environment must build before the SSR environment. Original error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const entries = Object.entries(manifest);
  const entry =
    entries.find(([, item]) => item.isEntry && item.name === "client") ??
    entries.find(
      ([key, item]) =>
        item.isEntry && /client-entry|virtual:vynn\/client-entry/.test(key),
    ) ??
    entries.find(([, item]) => item.isEntry);

  if (!entry) {
    throw new Error(
      `[Vynn Start] No client entry was found in ${manifestPath}.`,
    );
  }

  return {
    file: entry[1].file,
    css: entry[1].css ?? [],
  };
}

function createSsrHandlerCode(options: {
  clientEntryUrl: string;
  css: string[];
  base: string;
  title: string;
  mountId: string;
  dev: boolean;
  serverFunctions: boolean;
}): string {
  const { clientEntryUrl, css, base, title, mountId, dev, serverFunctions } =
    options;

  return [
    `import { render } from ${JSON.stringify(SERVER_ENTRY_ID)};`,
    ...(serverFunctions
      ? [
          `import { handleServerFunctionRequest } from "virtual:vynn/server-functions";`,
        ]
      : []),
    `const CLIENT_ENTRY_URL = ${JSON.stringify(clientEntryUrl)};`,
    `const CSS_ASSETS = ${JSON.stringify(css)};`,
    `const BASE = ${JSON.stringify(base)};`,
    `const TITLE = ${JSON.stringify(title)};`,
    `const MOUNT_ID = ${JSON.stringify(mountId)};`,
    `const IS_DEV = ${JSON.stringify(dev)};`,
    `const DEV_CSS_URL = ${JSON.stringify(DEV_CSS_URL)};`,
    `function escapeAttribute(value) { return String(value).replace(/&/g, "&amp;").replace(/\"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }`,
    `function assetUrl(path) {`,
    `  const value = String(path).replace(/^\\/+/, "");`,
    `  if (BASE === "./") return "./" + value;`,
    `  if (/^https?:\\/\\//.test(BASE)) return BASE.replace(/\\/$/, "") + "/" + value;`,
    `  const prefix = BASE === "/" ? "" : BASE.replace(/\\/$/, "");`,
    `  return prefix + "/" + value;`,
    `}`,
    `function documentPrefix() {`,
    `  const css = IS_DEV`,
    `    ? '<link rel="stylesheet" href="' + assetUrl(DEV_CSS_URL) + '">'`,
    `    : CSS_ASSETS.map((file) => '<link rel="stylesheet" href="' + escapeAttribute(assetUrl(file)) + '">').join("");`,
    `  const viteClient = IS_DEV ? '<script type="module" src="' + escapeAttribute(assetUrl("/@vite/client")) + '"></script>' : "";`,
    `  return '<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>' + TITLE.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") + '</title>' + css + viteClient + '</head><body><div id="' + escapeAttribute(MOUNT_ID) + '">';`,
    `}`,
    `function asReadableStream(value) {`,
    `  if (value instanceof ReadableStream) return value;`,
    `  if (typeof value === "string") return new Response(value).body;`,
    `  if (value instanceof Uint8Array) return new Response(value).body;`,
    `  throw new TypeError("[Vynn Start] The server entry render() must return a string, Uint8Array, or ReadableStream.");`,
    `}`,
    `function withDocument(body) {`,
    `  const reader = body.getReader();`,
    `  const encoder = new TextEncoder();`,
    `  return new ReadableStream({`,
    `    async start(controller) {`,
    `      controller.enqueue(encoder.encode(documentPrefix()));`,
    `      try {`,
    `        while (true) {`,
    `          const result = await reader.read();`,
    `          if (result.done) break;`,
    `          controller.enqueue(result.value);`,
    `        }`,
    `        controller.enqueue(encoder.encode('</div><script type="module" src="' + escapeAttribute(CLIENT_ENTRY_URL) + '"></script></body></html>'));`,
    `        controller.close();`,
    `      } catch (error) { controller.error(error); }`,
    `      finally { reader.releaseLock(); }`,
    `    },`,
    `    cancel(reason) { return reader.cancel(reason); },`,
    `  });`,
    `}`,
    `export async function handleRequest(request) {`,
    ...(serverFunctions
      ? [
          `  const serverFunctionResponse = await handleServerFunctionRequest(request);`,
          `  if (serverFunctionResponse) return serverFunctionResponse;`,
        ]
      : []),
    `  if (request.method !== "GET" && request.method !== "HEAD") {`,
    `    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });`,
    `  }`,
    `  const url = new URL(request.url);`,
    `  const headers = { "content-type": "text/html; charset=utf-8" };`,
    `  if (request.method === "HEAD") return new Response(null, { status: 200, headers });`,
    `  const result = await render(url.pathname + url.search);`,
    `  if (result instanceof Response) return result;`,
    `  return new Response(withDocument(asReadableStream(result)), { status: 200, headers });`,
    `}`,
    `export default { fetch(request) { return handleRequest(request); } };`,
    "",
  ].join("\n");
}

function createClientShell(options: {
  base: string;
  title: string;
  mountId: string;
  clientEntryUrl: string;
  css?: string[];
  dev: boolean;
}): string {
  const css = options.dev
    ? ""
    : (options.css ?? [])
        .map(
          (file) =>
            `<link rel="stylesheet" href="${escapeHtml(
              joinAssetBase(options.base, `/${file}`),
            )}">`,
        )
        .join("");
  const viteClient = options.dev
    ? `<script type="module" src="${escapeHtml(joinAssetBase(options.base, "/@vite/client"))}"></script>`
    : "";

  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="UTF-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    `<title>${escapeHtml(options.title)}</title>`,
    css,
    viteClient,
    "</head>",
    "<body>",
    `<div id="${escapeHtml(options.mountId)}"></div>`,
    `<script type="module" src="${escapeHtml(options.clientEntryUrl)}"></script>`,
    "</body>",
    "</html>",
  ].join("");
}

function getClientEntryDevUrl(
  entries: ResolvedEntries,
  root: string,
  base: string,
): string {
  if (entries.clientFile) {
    return joinAssetBase(base, toDevUrl(root, entries.clientFile));
  }
  return joinAssetBase(base, `/@id/__x00__${CLIENT_ENTRY_ID}`);
}

function toDevUrl(root: string, file: string): string {
  const rel = relative(root, file);
  if (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel)) {
    return `/${rel.replace(/\\/g, "/")}`;
  }
  return `/@fs/${file.replace(/\\/g, "/")}`;
}

function joinAssetBase(base: string, pathname: string): string {
  if (/^https?:\/\//.test(pathname)) return pathname;
  const cleanPath = `/${pathname.replace(/^\/+/, "")}`;
  if (base === "./") return `.${cleanPath}`;
  if (/^https?:\/\//.test(base))
    return `${base.replace(/\/$/, "")}${cleanPath}`;
  const prefix = base === "/" ? "" : `/${base.replace(/^\/+|\/+$/g, "")}`;
  return `${prefix}${cleanPath}`;
}

function addBaseToRequestUrl(base: string, incomingUrl: string): string {
  const parsed = new URL(incomingUrl, "http://vynn.local");
  const pathname = parsed.pathname;
  const basePath = base.startsWith("/") ? base.replace(/\/$/, "") : "";
  const alreadyPrefixed =
    !basePath || pathname === basePath || pathname.startsWith(`${basePath}/`);
  const path = alreadyPrefixed
    ? pathname
    : `${basePath}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
  return `${path || "/"}${parsed.search}`;
}

function isHtmlNavigation(req: IncomingMessage): boolean {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  const accept = req.headers.accept;
  return (
    !accept ||
    accept.includes("text/html") ||
    accept.includes("application/xhtml+xml") ||
    accept.includes("*/*")
  );
}

function isFrameworkRequest(url: string): boolean {
  const pathname = new URL(url, "http://vynn.local").pathname;
  return (
    pathname.startsWith("/@") ||
    pathname === DEV_CSS_URL ||
    pathname === "/favicon.ico"
  );
}

function createWebRequest(req: IncomingMessage, requestUrl: string): Request {
  const encrypted = Boolean((req.socket as { encrypted?: boolean }).encrypted);
  const origin = `${encrypted ? "https" : "http"}://${req.headers.host ?? "localhost"}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else if (value !== undefined) {
      headers.set(key, value);
    }
  }
  const method = req.method ?? "GET";
  const init: RequestInit & { duplex?: "half" } = { method, headers };
  if (method !== "GET" && method !== "HEAD") {
    init.body = Readable.toWeb(req) as ReadableStream<Uint8Array>;
    init.duplex = "half";
  }
  return new Request(new URL(requestUrl, origin), init);
}

async function writeResponse(
  res: ServerResponse,
  response: Response,
): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    // The Node server owns transfer-encoding and computes lengths for bodies.
    if (
      key.toLowerCase() !== "content-length" &&
      key.toLowerCase() !== "transfer-encoding"
    ) {
      res.setHeader(key, value);
    }
  });

  if (!response.body) {
    res.end();
    return;
  }

  const reader = response.body.getReader();
  const cancelOnClose = () => {
    if (!res.writableEnded) void reader.cancel().catch(() => undefined);
  };
  res.once("close", cancelOnClose);

  try {
    while (!res.destroyed) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!res.write(value)) {
        await new Promise<void>((resolveDrain, reject) => {
          const cleanup = () => {
            res.off("drain", onDrain);
            res.off("close", onClose);
            res.off("error", onError);
          };
          const onDrain = () => {
            cleanup();
            resolveDrain();
          };
          const onClose = () => {
            cleanup();
            reject(new Error("Client disconnected during Vynn SSR."));
          };
          const onError = (error: Error) => {
            cleanup();
            reject(error);
          };
          res.once("drain", onDrain);
          res.once("close", onClose);
          res.once("error", onError);
        });
      }
    }
    if (!res.destroyed) res.end();
  } finally {
    res.off("close", cancelOnClose);
    if (res.destroyed) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
