import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseSync, visitorKeys } from "oxc-parser";
import { type PreviewServer, type ResolvedConfig, type ViteDevServer, build } from "vite";
import {
  transformServerFunctions,
  type TransformServerFunctionsResult,
} from "vynn-compiler/server-functions";

import { createWebRequest, writeResponse } from "../app/http.ts";
import { registerServerFunctionDevMiddleware } from "./dev-middleware.ts";
import { makeClientRuntime, makeServerRuntime } from "./runtime.ts";
import {
  CLIENT_RUNTIME_ID,
  DEFAULT_ENDPOINT,
  type Node,
  RESOLVED_CLIENT_RUNTIME_ID,
  RESOLVED_SERVER_FUNCTIONS_API_ID,
  RESOLVED_SERVER_FUNCTION_IMPL_PREFIX,
  RESOLVED_SERVER_RUNTIME_ID,
  SERVER_FUNCTIONS_API_ID,
  SERVER_FUNCTION_IMPL_PREFIX,
  SERVER_FUNCTION_MANIFEST_SENTINEL,
  SERVER_RUNTIME_ID,
  type ServerFunctionReference,
  type VynnServerFunctionsOptions,
  type VynnServerFunctionsPlugin,
  applyBaseToEndpoint,
  normalizeAllowedOrigin,
} from "./shared.ts";

const SCRIPT_EXTENSION_RE = /\.(?:[cm]?[jt]sx?)$/i;

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
 * RPC is wired into Vite dev middleware, even when Vynn app mode and SSR are
 * disabled. In standalone mode, the client build also creates a separate
 * server-functions bundle, and Vite preview mounts its handler automatically.
 * Vynn app mode continues to integrate the handler into its own SSR server.
 * Function closures are not serialized.
 */
export function serverFunctionsPlugin(
  options: VynnServerFunctionsOptions = {},
  { standalone = true }: { standalone?: boolean } = {},
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
  const refsByModule = new Map<string, ServerFunctionReference[]>();
  const refsById = new Map<string, ServerFunctionReference>();
  const implementationChunkRefs = new Map<string, string>();
  // Vite's standalone `build --ssr` path may not expose an Environment
  // consumer named "server", unlike Vynn App's explicit SSR environment.
  // Remember the server transform so the emitted implementation manifest is
  // still injected into the standalone server-functions handler bundle.
  let hasServerBuildTransform = false;

  const replaceModuleRefs = (moduleId: string, references: ServerFunctionReference[]): void => {
    const previous = refsByModule.get(moduleId) ?? [];
    for (const reference of previous) refsById.delete(reference.id);

    if (references.length === 0) {
      refsByModule.delete(moduleId);
      return;
    }
    refsByModule.set(moduleId, references);
    for (const reference of references) refsById.set(reference.id, reference);
  };

  const plugin: VynnServerFunctionsPlugin = {
    name: "vynn-server-functions",
    enforce: "pre",

    config(config, env) {
      // Match the standard full-stack output layout even when Vynn app mode
      // and SSR rendering are disabled. Vite preview then serves the client
      // from <outDir>/client while the RPC implementation stays in <outDir>/server.
      if (!standalone || env.isSsrBuild) return null;

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

    configResolved(config) {
      resolvedConfig = config;
      projectRoot = config.root;
      isDevelopment = config.command === "serve";
      isBuild = config.command === "build";
      isSsrBuild = Boolean(config.build.ssr);
      ssrEntryIds.clear();
      if (typeof config.build.ssr === "string") {
        registerSsrEntries(config.build.ssr);
      } else if (config.build.ssr === true) {
        registerSsrEntries(config.build.rolldownOptions.input);
      }
      resolvedEndpoint = applyBaseToEndpoint(config.base || "/", endpoint);

      // Keep the backend outside the public client output, following the
      // conventional <outDir>/client + <outDir>/server layout.
      const clientOutDir = resolve(config.root, config.build.outDir || "dist");
      serverFunctionsOutDir = resolve(dirname(clientOutDir), "server");
    },

    resolveId(id) {
      if (id === CLIENT_RUNTIME_ID) return RESOLVED_CLIENT_RUNTIME_ID;
      if (id === SERVER_RUNTIME_ID) return RESOLVED_SERVER_RUNTIME_ID;
      if (id === SERVER_FUNCTIONS_API_ID) return RESOLVED_SERVER_FUNCTIONS_API_ID;
      if (id.startsWith(SERVER_FUNCTION_IMPL_PREFIX))
        return `${RESOLVED_SERVER_FUNCTION_IMPL_PREFIX}${id.slice(SERVER_FUNCTION_IMPL_PREFIX.length)}`;
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
          manifestSentinel: SERVER_FUNCTION_MANIFEST_SENTINEL,
        });
      if (id === RESOLVED_SERVER_FUNCTIONS_API_ID)
        return `export { handleServerFunctionRequest } from ${JSON.stringify(SERVER_RUNTIME_ID)};`;
      if (id.startsWith(RESOLVED_SERVER_FUNCTION_IMPL_PREFIX)) {
        const functionId = id.slice(RESOLVED_SERVER_FUNCTION_IMPL_PREFIX.length);
        const reference = refsById.get(functionId);
        if (!reference)
          this.error(`[Vynn use server] Missing implementation metadata for ${functionId}.`);
        const moduleId = reference.moduleId.replace(/\\/g, "/");
        return [
          `import { ${reference.exportName} as implementation } from ${JSON.stringify(moduleId)};`,
          "export default implementation;",
        ].join("\n");
      }
      return null;
    },

    transform(source, id, transformOptions) {
      if (options.enabled === false) return null;

      const cleanId = cleanModuleId(id);
      if (id.startsWith("\0") || cleanId.includes("/node_modules/")) return null;
      if (!SCRIPT_EXTENSION_RE.test(cleanId)) return null;

      const moduleId = resolve(projectRoot, cleanId);
      // Clear the old HMR manifest even if the edited file removed its directive.
      replaceModuleRefs(moduleId, []);

      // Custom SSR builds expose the RPC handler from the same emitted entry
      // as render(). Inject it here so application source needn't import the
      // virtual server-functions API.
      let injectedHandlerExport = false;
      const normalizedModuleId = resolve(projectRoot, cleanId).replace(/\\/g, "/");
      if (isSsrBuild && ssrEntryIds.has(normalizedModuleId)) {
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

      const environmentConsumer = (
        this as unknown as { environment?: { config?: { consumer?: string } } }
      ).environment?.config?.consumer;
      const isServer =
        environmentConsumer === "server" ||
        isSsrBuild ||
        (transformOptions as { ssr?: boolean } | undefined)?.ssr === true;

      if (isBuild && isServer) hasServerBuildTransform = true;

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
      replaceModuleRefs(moduleId, references);

      if (isServer && isBuild) {
        for (const reference of references) {
          if (!implementationChunkRefs.has(reference.id)) {
            const fileReference = this.emitFile({
              type: "chunk",
              id: `${SERVER_FUNCTION_IMPL_PREFIX}${reference.id}`,
              name: `vynn-server-function-${reference.id}`,
            });
            implementationChunkRefs.set(reference.id, fileReference);
          }
        }
      }

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
      if (!standalone || !isBuild || isSsrBuild || !resolvedConfig || refsByModule.size === 0) {
        return;
      }

      const tempDirectory = await mkdtemp(resolve(projectRoot, ".vynn-server-functions-"));
      const entryPath = resolve(tempDirectory, "entry.ts");
      const imports = [...refsByModule.keys()].map((moduleId) => {
        const relativeModuleId = relative(tempDirectory, moduleId).replace(/\\/g, "/");
        const specifier = relativeModuleId.startsWith(".")
          ? relativeModuleId
          : `./${relativeModuleId}`;
        return `import ${JSON.stringify(specifier)};`;
      });

      try {
        await writeFile(
          entryPath,
          [
            ...imports,
            `export { handleServerFunctionRequest } from ${JSON.stringify(SERVER_FUNCTIONS_API_ID)};`,
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
      } finally {
        await rm(tempDirectory, { recursive: true, force: true });
      }
    },

    generateBundle(_outputOptions, bundle) {
      const consumer = (this as unknown as { environment?: { config?: { consumer?: string } } })
        .environment?.config?.consumer;
      if (!isBuild || (consumer !== "server" && !hasServerBuildTransform)) return;
      for (const output of Object.values(bundle)) {
        if (output.type !== "chunk" || !output.code.includes(SERVER_FUNCTION_MANIFEST_SENTINEL))
          continue;
        const manifest: Record<string, string> = {};
        for (const [functionId, fileReference] of implementationChunkRefs) {
          let path = relative(dirname(output.fileName), this.getFileName(fileReference)).replace(
            /\\/g,
            "/",
          );
          if (!path.startsWith(".")) path = `./${path}`;
          manifest[functionId] = path;
        }
        // Parse the finalized chunk instead of assuming how the minifier
        // spells string literals (quote style, escaping, or template syntax).
        const parsed = parseSync(output.fileName, output.code, {
          lang: "js",
          sourceType: "module",
          astType: "js",
          preserveParens: false,
          showSemanticErrors: false,
        } as never);

        let manifestLiteral: Node | undefined;
        const findManifestLiteral = (node: Node): void => {
          if (manifestLiteral || !node || typeof node !== "object") return;

          if (
            (node.type === "Literal" || node.type === "StringLiteral") &&
            typeof node.value === "string" &&
            node.value.includes(SERVER_FUNCTION_MANIFEST_SENTINEL)
          ) {
            manifestLiteral = {
              start: node.start,
              end: node.end,
              value: node.value,
            };
            return;
          }

          // Some minifiers may represent a plain string as a no-expression
          // template literal. Treat it the same way as a quoted string.
          if (
            node.type === "TemplateLiteral" &&
            node.expressions?.length === 0 &&
            Array.isArray(node.quasis)
          ) {
            const value = node.quasis
              .map((quasi: Node) => quasi.value?.cooked ?? quasi.value?.raw ?? "")
              .join("");
            if (value.includes(SERVER_FUNCTION_MANIFEST_SENTINEL)) {
              manifestLiteral = {
                start: node.start,
                end: node.end,
                value,
              };
              return;
            }
          }

          const keys = (visitorKeys as Record<string, string[]>)[node.type] ?? [];
          for (const key of keys) {
            const child = node[key];
            if (Array.isArray(child)) {
              for (const item of child) {
                if (item && typeof item === "object" && typeof item.type === "string") {
                  findManifestLiteral(item);
                  if (manifestLiteral) return;
                }
              }
            } else if (child && typeof child === "object" && typeof child.type === "string") {
              findManifestLiteral(child);
              if (manifestLiteral) return;
            }
          }
        };

        findManifestLiteral(parsed.program);
        if (!manifestLiteral)
          this.error(
            "[Vynn use server] Could not locate the production function manifest literal.",
          );

        const replacementValue = manifestLiteral.value.replace(
          SERVER_FUNCTION_MANIFEST_SENTINEL,
          JSON.stringify(manifest),
        );
        output.code =
          output.code.slice(0, manifestLiteral.start) +
          JSON.stringify(replacementValue) +
          output.code.slice(manifestLiteral.end);
      }
    },

    configureServer(server: ViteDevServer) {
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
      if (!standalone) return;

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
            await writeResponse(res, response);
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
