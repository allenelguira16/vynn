import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { type PreviewServer, type ResolvedConfig, type ViteDevServer, build } from "vite";
import {
  transformServerFunctions,
  type TransformServerFunctionsResult,
} from "vynn-compiler/server-functions";

import { isRunnableViteEnvironment } from "../../host.ts";

import { createWebRequest, writeResponse } from "../app/http.ts";
import { SSR_HANDLER_ID } from "../app/shared.ts";
import { registerServerFunctionDevMiddleware } from "./dev-middleware.ts";
import { makeClientRuntime, makeServerRuntime } from "./runtime.ts";
import {
  CLIENT_RUNTIME_ID,
  DEFAULT_ENDPOINT,
  RESOLVED_CLIENT_RUNTIME_ID,
  RESOLVED_SERVER_FUNCTIONS_API_ID,
  RESOLVED_SERVER_FUNCTIONS_MANIFEST_ID,
  RESOLVED_SERVER_RUNTIME_ID,
  SERVER_FUNCTIONS_API_ID,
  SERVER_FUNCTIONS_MANIFEST_FILE,
  SERVER_FUNCTIONS_MANIFEST_ID,
  SERVER_RUNTIME_ID,
  type ServerFunctionReference,
  type VynnServerFunctionsOptions,
  type VynnServerFunctionsPlugin,
  applyBaseToEndpoint,
  normalizeAllowedOrigin,
} from "./shared.ts";

const SCRIPT_EXTENSION_RE = /\.(?:[cm]?[jt]sx?)$/i;

export function createServerFunctionManifestCode(moduleIds: readonly string[]): string {
  const imports = [...new Set(moduleIds)]
    .map((moduleId) => moduleId.replace(/\\/g, "/"))
    .map((moduleId) => "import " + JSON.stringify(moduleId) + ";");

  return [...imports, "export {};", ""].join("\n");
}

function readPersistedServerFunctionModules(manifestPath: string, root: string): string[] {
  if (!existsSync(manifestPath)) return [];

  try {
    const parsed = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      version?: number;
      modules?: unknown;
    };
    if (
      !Array.isArray(parsed.modules) ||
      parsed.modules.some((moduleId) => typeof moduleId !== "string")
    ) {
      throw new TypeError("The manifest must contain a string array named modules.");
    }

    return [...new Set(parsed.modules as string[])].map((moduleId) =>
      resolve(root, moduleId).replace(/\\/g, "/"),
    );
  } catch (error) {
    throw new Error(
      "[Vynn use server] Could not read the server-function manifest at " +
        manifestPath +
        ": " +
        (error instanceof Error ? error.message : String(error)),
      { cause: error },
    );
  }
}

function includesSsrHandlerEntry(input: unknown): boolean {
  if (typeof input === "string") {
    return input === SSR_HANDLER_ID || input === `\0${SSR_HANDLER_ID}`;
  }

  if (Array.isArray(input)) {
    return input.some(includesSsrHandlerEntry);
  }

  if (input && typeof input === "object") {
    return Object.values(input as Record<string, unknown>).some(includesSsrHandlerEntry);
  }

  return false;
}

function getSsrEnvironment(config: unknown):
  | {
      build?: {
        rolldownOptions?: {
          input?: unknown;
        };
      };
    }
  | undefined {
  return (
    config as {
      environments?: {
        ssr?: {
          build?: {
            rolldownOptions?: {
              input?: unknown;
            };
          };
        };
      };
    }
  ).environments?.ssr;
}

function isIntegratedSsrAppConfig(config: unknown): boolean {
  const ssrEnvironment = getSsrEnvironment(config);
  return includesSsrHandlerEntry(ssrEnvironment?.build?.rolldownOptions?.input);
}

function cleanModuleId(id: string): string {
  return id.split("?", 1)[0].replace(/\\/g, "/");
}

/**
 * Function-level `"use server"` transform.
 *
 * Example:
 *   const data = $async(async () => {
 *     "use server";
 *     return await getData();
 *   });
 *
 * Server output extracts the implementation into a named module export and
 * makes the inline callback a local reference. Client output replaces the
 * callback with an RPC reference. This first version deliberately does not
 * serialize captured lexical variables; use function arguments for values the
 * server function needs.
 *
 * By default, RPC is wired into Vite dev/preview middleware when Vite owns
 * the runnable SSR environment. Deployment integrations that own the SSR
 * environment dispatch through the Fetch-compatible application handler.
 * For CSR builds, a separate server-functions bundle is generated.
 * Function closures are not serialized.
 */
export function serverFunctionsPlugin(
  options: VynnServerFunctionsOptions = {},
): VynnServerFunctionsPlugin {
  const endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
  if (
    !endpoint.startsWith("/") ||
    endpoint.startsWith("//") ||
    endpoint.includes("?") ||
    endpoint.includes("#")
  )
    throw new Error(
      "[Vynn use server] endpoint must be an absolute pathname without a query or hash.",
    );
  // The framework runtime owns the default and maximum request size.
  // Passing undefined lets it apply its own default; its handler validates
  // the configured value against the hard limit before accepting requests.
  const maxRequestBytes = options.maxRequestBytes;
  if (
    maxRequestBytes !== undefined &&
    (!Number.isSafeInteger(maxRequestBytes) || maxRequestBytes < 1)
  ) {
    throw new Error("[Vynn use server] maxRequestBytes must be a positive safe integer.");
  }
  const allowedOrigins = (options.allowedOrigins ?? []).map(normalizeAllowedOrigin);
  let isDevelopment = false;
  let isBuild = false;
  let projectRoot = process.cwd();
  let resolvedEndpoint = endpoint;
  let resolvedConfig: ResolvedConfig | undefined;
  let isSsrBuild = false;
  let hasIntegratedSsrApp = false;
  let clientOutDir = resolve(projectRoot, "dist", "client");
  let serverFunctionsOutDir = resolve(projectRoot, "dist", "server");
  const ssrEntryIds = new Set<string>();
  const registerSsrEntries = (input: unknown): void => {
    if (typeof input === "string") {
      if (!input || input.startsWith("\0") || input.startsWith("virtual:")) return;
      ssrEntryIds.add(resolve(projectRoot, input).replace(/\\/g, "/"));
      return;
    }

    if (Array.isArray(input)) {
      for (const entry of input) registerSsrEntries(entry);
      return;
    }

    if (input && typeof input === "object") {
      for (const entry of Object.values(input as Record<string, unknown>))
        registerSsrEntries(entry);
    }
  };
  const refsByTarget = {
    client: new Map<string, ServerFunctionReference[]>(),
    server: new Map<string, ServerFunctionReference[]>(),
  };
  const refsById = new Map<string, ServerFunctionReference>();

  const replaceModuleRefs = (
    target: "client" | "server",
    moduleId: string,
    references: ServerFunctionReference[],
  ): void => {
    const targetModules = refsByTarget[target];
    if (references.length === 0) targetModules.delete(moduleId);
    else targetModules.set(moduleId, references);

    refsById.clear();
    for (const modules of Object.values(refsByTarget)) {
      for (const moduleReferences of modules.values()) {
        for (const reference of moduleReferences) refsById.set(reference.id, reference);
      }
    }
  };

  const plugin: VynnServerFunctionsPlugin = {
    name: "vynn-server-functions",
    enforce: "pre",
    sharedDuringBuild: true,

    config: {
      // Run after Vynn's app config so the SSR handler entry is visible here.
      // Standalone use (without an integrated Vynn SSR app) owns its client
      // output layout; Vynn CSR already configures dist/client itself.
      order: "post",
      handler(config, env) {
        const integratedSsrApp =
          isIntegratedSsrAppConfig(config) ||
          (env.isPreview && getSsrEnvironment(config) !== undefined);
        if (integratedSsrApp) hasIntegratedSsrApp = true;
        if (integratedSsrApp || env.isSsrBuild) return null;

        const configuredOutDir = config.build?.outDir || "dist";
        const clientOutDir =
          basename(configuredOutDir) === "client"
            ? configuredOutDir
            : resolve(configuredOutDir, "client");

        return {
          build: {
            outDir: clientOutDir,
            manifest: true,
          },
        };
      },
    },

    configResolved(config) {
      resolvedConfig = config;
      projectRoot = config.root;
      isDevelopment = config.command === "serve";
      isBuild = config.command === "build";
      isSsrBuild = Boolean(config.build.ssr);
      hasIntegratedSsrApp = hasIntegratedSsrApp || isIntegratedSsrAppConfig(config);
      ssrEntryIds.clear();
      if (typeof config.build.ssr === "string") {
        registerSsrEntries(config.build.ssr);
      } else if (config.build.ssr === true) {
        registerSsrEntries(config.build.rolldownOptions.input);
      }
      resolvedEndpoint = applyBaseToEndpoint(config.base || "/", endpoint);

      const environments = (
        config as ResolvedConfig & {
          environments?: Record<string, { build?: { outDir?: string } }>;
        }
      ).environments;
      const configuredOutDir = config.build.outDir || "dist";
      const defaultClientOutDir =
        basename(configuredOutDir) === "client"
          ? configuredOutDir
          : resolve(dirname(configuredOutDir), "client");
      clientOutDir = resolve(
        config.root,
        environments?.client?.build?.outDir ?? defaultClientOutDir,
      );
      serverFunctionsOutDir = resolve(
        config.root,
        environments?.ssr?.build?.outDir ?? resolve(dirname(clientOutDir), "server"),
      );
    },

    resolveId(id) {
      if (id === CLIENT_RUNTIME_ID) return RESOLVED_CLIENT_RUNTIME_ID;
      if (id === SERVER_RUNTIME_ID) return RESOLVED_SERVER_RUNTIME_ID;
      if (id === SERVER_FUNCTIONS_API_ID) return RESOLVED_SERVER_FUNCTIONS_API_ID;
      if (id === SERVER_FUNCTIONS_MANIFEST_ID) return RESOLVED_SERVER_FUNCTIONS_MANIFEST_ID;
      return null;
    },

    load(id) {
      if (id === RESOLVED_CLIENT_RUNTIME_ID) return makeClientRuntime(resolvedEndpoint);
      if (id === RESOLVED_SERVER_RUNTIME_ID)
        return makeServerRuntime(resolvedEndpoint, {
          maxRequestBytes,
          allowedOrigins,
          exposeErrors: options.exposeErrors ?? isDevelopment,
          development: isDevelopment,
        });
      if (id === RESOLVED_SERVER_FUNCTIONS_API_ID) {
        return [
          "import " + JSON.stringify(SERVER_FUNCTIONS_MANIFEST_ID) + ";",
          "export { handleServerFunctionRequest } from " + JSON.stringify(SERVER_RUNTIME_ID) + ";",
        ].join("\n");
      }
      if (id === RESOLVED_SERVER_FUNCTIONS_MANIFEST_ID) {
        if (!isBuild) return "export {};";
        const modules = new Set<string>(refsByTarget.client.keys());
        for (const moduleId of readPersistedServerFunctionModules(
          resolve(clientOutDir, SERVER_FUNCTIONS_MANIFEST_FILE),
          projectRoot,
        )) {
          modules.add(moduleId);
        }
        return createServerFunctionManifestCode([...modules]);
      }
      return null;
    },

    transform(source, id, transformOptions) {
      if (options.enabled === false) return null;

      const cleanId = cleanModuleId(id);
      if (id.startsWith("\0") || cleanId.includes("/node_modules/")) return null;
      if (!SCRIPT_EXTENSION_RE.test(cleanId)) return null;

      const moduleId = resolve(projectRoot, cleanId);
      const environmentConsumer = (
        this as unknown as { environment?: { config?: { consumer?: string } } }
      ).environment?.config?.consumer;
      const transformSsr = (transformOptions as { ssr?: boolean } | undefined)?.ssr;
      // Vite shares this plugin instance across environments. The global SSR
      // build flag is only a fallback for legacy/single-environment builds;
      // an explicit environment consumer must always win.
      const isServer =
        typeof environmentConsumer === "string"
          ? environmentConsumer === "server"
          : typeof transformSsr === "boolean"
            ? transformSsr
            : isSsrBuild;
      const target = isServer ? "server" : "client";

      // Keep each environment's discoveries independent. An SSR transform
      // must not erase the client manifest for functions used only in events.
      replaceModuleRefs(target, moduleId, []);

      // Custom SSR builds expose the RPC handler from the same emitted entry
      // as render(). Inject it here so application source needn't import the
      // virtual server-functions API.
      let injectedHandlerExport = false;
      const normalizedModuleId = resolve(projectRoot, cleanId).replace(/\\/g, "/");
      if (isServer && isSsrBuild && ssrEntryIds.has(normalizedModuleId)) {
        const alreadyExportsHandler =
          /\bexport\s*\{[^}]*\bhandleServerFunctionRequest\b[^}]*\}/s.test(source);

        if (!alreadyExportsHandler) {
          const importsHandler =
            /\bimport\s*\{[^}]*\bhandleServerFunctionRequest\b[^}]*\}\s*from\s*["']virtual:vynn\/server-functions["']/.test(
              source,
            );
          const declaresHandler =
            /\b(?:const|let|var|function|class)\s+handleServerFunctionRequest\b/.test(source);

          if (declaresHandler && !importsHandler) {
            this.error(
              "[Vynn use server] The SSR entry declares handleServerFunctionRequest. Remove that declaration so Vynn can expose its generated handler automatically.",
            );
          }

          if (importsHandler) {
            source += "\nexport { handleServerFunctionRequest };\n";
          } else {
            source +=
              "\nexport { handleServerFunctionRequest } from " +
              JSON.stringify(SERVER_FUNCTIONS_API_ID) +
              ";\n";
          }
          injectedHandlerExport = true;
        }
      }

      if (!source.includes("use server")) {
        return injectedHandlerExport ? { code: source, map: null } : null;
      }

      let transformed: TransformServerFunctionsResult | null;
      try {
        transformed = transformServerFunctions(source, cleanId, {
          root: projectRoot,
          target: isServer ? "server" : "client",
          runtimeModule: isServer ? SERVER_RUNTIME_ID : CLIENT_RUNTIME_ID,
        });
      } catch (error) {
        this.error(error instanceof Error ? error.message : String(error));
        return null;
      }

      if (!transformed) {
        return injectedHandlerExport ? { code: source, map: null } : null;
      }

      const references = transformed.functions;
      replaceModuleRefs(target, moduleId, references);

      return {
        code: transformed.code,
        map: transformed.map,
        meta: { vynnServerFunctions: references },
      };
    },

    async closeBundle() {
      // A normal client build only produces browser assets. Build a separate
      // server bundle from the modules containing server functions so preview
      // has a real RPC handler. The SSR build's own closeBundle is skipped to
      // prevent recursive builds.
      if (
        hasIntegratedSsrApp ||
        !isBuild ||
        isSsrBuild ||
        !resolvedConfig ||
        refsByTarget.client.size === 0
      ) {
        return;
      }

      const tempDirectory = await mkdtemp(resolve(projectRoot, ".vynn-server-functions-"));
      const entryPath = resolve(tempDirectory, "entry.ts");

      try {
        await writeFile(
          entryPath,
          [
            "export { handleServerFunctionRequest } from " +
              JSON.stringify(SERVER_FUNCTIONS_API_ID) +
              ";",
            "",
          ].join("\n"),
          "utf8",
        );

        await build({
          configFile: resolvedConfig.configFile || false,
          root: projectRoot,
          mode: resolvedConfig.mode,
          logLevel: resolvedConfig.logLevel,
          build: {
            ssr: entryPath,
            outDir: serverFunctionsOutDir,
            emptyOutDir: true,
            rolldownOptions: {
              output: {
                entryFileNames: "server.js",
              },
            },
          },
        });

        // The generated bundle is ESM even if the host app package uses
        // CommonJS (or has no package.json declaring a module type).
        await writeFile(
          resolve(serverFunctionsOutDir, "package.json"),
          JSON.stringify({ type: "module" }, null, 2) + "\n",
          "utf8",
        );
        await rm(resolve(clientOutDir, SERVER_FUNCTIONS_MANIFEST_FILE), { force: true });
      } finally {
        await rm(tempDirectory, { recursive: true, force: true });
      }
    },

    async writeBundle(outputOptions) {
      if (!isBuild) return;

      const consumer = this.environment?.config.consumer;
      if (consumer === "server") {
        if (hasIntegratedSsrApp) {
          // Nitro copies the client output into its public directory after all
          // Vite environments finish. The manifest is build-only metadata:
          // the SSR bundle has already consumed it at this point.
          await rm(resolve(clientOutDir, SERVER_FUNCTIONS_MANIFEST_FILE), { force: true });
        }
        return;
      }

      const isClientBuild = consumer === "client" || (consumer == null && !isSsrBuild);
      if (!isClientBuild) return;

      const modules = [...refsByTarget.client.keys()]
        .map((moduleId) => relative(projectRoot, moduleId).replace(/\\/g, "/"))
        .sort();
      const outDir = outputOptions.dir ? resolve(outputOptions.dir) : clientOutDir;
      const manifestPath = resolve(outDir, SERVER_FUNCTIONS_MANIFEST_FILE);
      await mkdir(dirname(manifestPath), { recursive: true });
      await writeFile(
        manifestPath,
        JSON.stringify({ version: 1, modules }, null, 2) + "\n",
        "utf8",
      );
    },

    configureServer(server: ViteDevServer) {
      // A deployment plugin with a non-runnable SSR environment owns the
      // request lifecycle for an integrated Vynn app.
      if (hasIntegratedSsrApp && !isRunnableViteEnvironment(server.environments.ssr)) return;

      registerServerFunctionDevMiddleware(server, {
        endpoint: resolvedEndpoint,
        maxRequestBytes,
        allowedOrigins,
        exposeErrors: options.exposeErrors,
        isDevelopment,
        refsById,
      });
    },

    configurePreviewServer(server: PreviewServer) {
      if (hasIntegratedSsrApp) return;

      let handlerPromise:
        | Promise<{
            handleServerFunctionRequest: (request: Request) => Promise<Response | null>;
          }>
        | undefined;

      // Register after Vite's static middleware so ordinary assets are still
      // handled by preview, and unmatched paths can fall through normally.
      return () => {
        server.middlewares.use((req, res, next) => {
          const pathname = new URL(req.url ?? "/", "http://vynn.local").pathname;
          if (pathname !== resolvedEndpoint) {
            next();
            return;
          }

          void (async () => {
            const handlerPath = resolve(serverFunctionsOutDir, "server.js");
            if (!existsSync(handlerPath)) {
              throw new Error(
                `[Vynn use server] The standalone server-functions bundle was not found at ${handlerPath}. Run \`vite build\` before \`vite preview\`.`,
              );
            }

            handlerPromise ??= import(
              /* @vite-ignore */
              pathToFileURL(handlerPath).href
            );
            const handler = await handlerPromise;
            const request = createWebRequest(req, req.url ?? "/");
            const response = await handler.handleServerFunctionRequest(request);
            if (!response) {
              next();
              return;
            }
            await writeResponse(res, response, {
              headers: server.config.preview.headers,
            });
          })().catch((error: unknown) => {
            if (res.headersSent) {
              res.destroy(error instanceof Error ? error : undefined);
              return;
            }
            next(error instanceof Error ? error : new Error(String(error)));
          });
        });
      };
    },

    getServerFunctions() {
      return [...refsById.values()];
    },
  };

  return plugin;
}

export type { VynnServerFunctionsOptions };
