import { dirname, relative, resolve } from "node:path";
import { parseSync } from "oxc-parser";
import type { ViteDevServer } from "vite";
import {
  applyBaseToEndpoint,
  normalizeAllowedOrigin,
  CLIENT_RUNTIME_ID,
  SERVER_RUNTIME_ID,
  SERVER_FUNCTIONS_API_ID,
  RESOLVED_CLIENT_RUNTIME_ID,
  RESOLVED_SERVER_RUNTIME_ID,
  RESOLVED_SERVER_FUNCTIONS_API_ID,
  SERVER_FUNCTION_IMPL_PREFIX,
  RESOLVED_SERVER_FUNCTION_IMPL_PREFIX,
  SERVER_FUNCTION_MANIFEST_SENTINEL,
  CREATE_SERVER_REFERENCE,
  SCRIPT_EXTENSION_RE,
  DEFAULT_ENDPOINT,
  MAX_REQUEST_BYTES,
  type Node,
  type ServerFunctionReference,
  type VynnServerFunctionsOptions,
  type VynnServerFunctionsPlugin,
  type MarkedFunction,
} from "./server-functions/shared.ts";
import {
  applyEdits,
  cleanModuleId,
  collectMarkedFunctions,
  containsNestedMarkedBoundary,
  getDirectiveValue,
  getModuleKey,
  inferParserLanguage,
  makeExtractedImplementation,
  makeReplacement,
} from "./server-functions/transform.ts";
import {
  makeClientRuntime,
  makeServerRuntime,
} from "./server-functions/runtime.ts";
import { registerServerFunctionDevMiddleware } from "./server-functions/dev-middleware.ts";

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
 * RPC is wired into Vite dev middleware. The virtual module
 * `virtual:vynn/server-functions` exposes `handleServerFunctionRequest` for
 * production custom SSR servers, and Vynn app mode integrates it automatically.
 * Production SSR builds emit implementation chunks and a dispatch manifest.
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
  const maxRequestBytes = options.maxRequestBytes ?? MAX_REQUEST_BYTES;
  if (
    !Number.isSafeInteger(maxRequestBytes) ||
    maxRequestBytes < 1 ||
    maxRequestBytes > 25 * 1024 * 1024
  )
    throw new Error(
      "[Vynn use server] maxRequestBytes must be a safe integer between 1 and 26214400.",
    );
  const allowedOrigins = (options.allowedOrigins ?? []).map(
    normalizeAllowedOrigin,
  );
  let isDevelopment = false;
  let isBuild = false;
  let projectRoot = process.cwd();
  let resolvedEndpoint = endpoint;
  const refsByModule = new Map<string, ServerFunctionReference[]>();
  const refsById = new Map<string, ServerFunctionReference>();
  const implementationChunkRefs = new Map<string, string>();

  const replaceModuleRefs = (
    moduleId: string,
    references: ServerFunctionReference[],
  ): void => {
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

    configResolved(config) {
      projectRoot = config.root;
      isDevelopment = config.command === "serve";
      isBuild = config.command === "build";
      resolvedEndpoint = applyBaseToEndpoint(config.base || "/", endpoint);
    },

    resolveId(id) {
      if (id === CLIENT_RUNTIME_ID) return RESOLVED_CLIENT_RUNTIME_ID;
      if (id === SERVER_RUNTIME_ID) return RESOLVED_SERVER_RUNTIME_ID;
      if (id === SERVER_FUNCTIONS_API_ID)
        return RESOLVED_SERVER_FUNCTIONS_API_ID;
      if (id.startsWith(SERVER_FUNCTION_IMPL_PREFIX))
        return `${RESOLVED_SERVER_FUNCTION_IMPL_PREFIX}${id.slice(SERVER_FUNCTION_IMPL_PREFIX.length)}`;
      return null;
    },

    load(id) {
      if (id === RESOLVED_CLIENT_RUNTIME_ID)
        return makeClientRuntime(resolvedEndpoint);
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
        const functionId = id.slice(
          RESOLVED_SERVER_FUNCTION_IMPL_PREFIX.length,
        );
        const reference = refsById.get(functionId);
        if (!reference)
          this.error(
            `[Vynn use server] Missing implementation metadata for ${functionId}.`,
          );
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
      if (id.startsWith("\0") || cleanId.includes("/node_modules/"))
        return null;
      if (!SCRIPT_EXTENSION_RE.test(cleanId)) return null;

      const moduleId = resolve(cleanId);
      // Clear the old HMR manifest even if the edited file removed its directive.
      replaceModuleRefs(moduleId, []);
      if (!source.includes("use server")) return null;

      let parsed: any;
      try {
        parsed = parseSync(cleanId, source, {
          lang: inferParserLanguage(cleanId),
          sourceType: "module",
          astType: "ts",
          preserveParens: false,
          showSemanticErrors: false,
        } as never);
      } catch (error) {
        this.error(
          `[Vynn use server] Could not parse ${cleanId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      const parseErrors: any[] = parsed.errors ?? parsed.diagnostics ?? [];
      const fatalErrors = parseErrors.filter(
        (error) =>
          error.severity === "Error" ||
          error.severity === 2 ||
          !("severity" in error),
      );
      if (fatalErrors.length > 0) {
        this.error(
          `[Vynn use server] Could not parse ${cleanId}:\n${fatalErrors
            .map((error) => error.message ?? String(error))
            .join("\n")}`,
        );
      }

      const program: Node = parsed.program;
      let marked: MarkedFunction[] = [];
      try {
        marked = collectMarkedFunctions(program, source, projectRoot, moduleId);
      } catch (error) {
        this.error(error instanceof Error ? error.message : String(error));
      }

      let moduleDirective: Node | undefined;
      for (const statement of program.body as Node[]) {
        const value = getDirectiveValue(statement);
        if (value === "use server") {
          moduleDirective = statement;
          break;
        }
        if (value === undefined) break;
      }
      if (moduleDirective) {
        this.error(
          `[Vynn use server] File-level "use server" is not supported yet. Put the directive inside a function body (${cleanId}).`,
        );
      }
      if (!marked || marked.length === 0) return null;

      if (containsNestedMarkedBoundary(marked, program)) {
        this.error(
          `[Vynn use server] A server-marked function cannot contain another server-marked function yet (${cleanId}).`,
        );
      }

      const environmentConsumer = (
        this as unknown as { environment?: { config?: { consumer?: string } } }
      ).environment?.config?.consumer;
      const isServer =
        environmentConsumer === "server" ||
        (transformOptions as { ssr?: boolean } | undefined)?.ssr === true;

      const moduleKey = getModuleKey(projectRoot, moduleId);
      const references = marked.map(({ id: functionId, exportName }) => ({
        id: functionId,
        moduleId,
        exportName,
      }));
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

      const edits = marked.map((item) => makeReplacement(item, isServer));
      let output = applyEdits(source, edits);

      if (isServer) {
        const implementations = marked
          .map((item) => makeExtractedImplementation(source, item))
          .join("\n\n");
        output += `\n\n// Vynn extracted server functions for ${moduleKey}\n${implementations}\n`;
        output = `import { createServerReference as ${CREATE_SERVER_REFERENCE} } from ${JSON.stringify(SERVER_RUNTIME_ID)};\n${output}`;
      } else {
        output = `import { createServerReference as ${CREATE_SERVER_REFERENCE} } from ${JSON.stringify(CLIENT_RUNTIME_ID)};\n${output}`;
      }

      return {
        code: output,
        map: null,
        meta: { vynnServerFunctions: references },
      };
    },

    generateBundle(_outputOptions, bundle) {
      const consumer = (
        this as unknown as { environment?: { config?: { consumer?: string } } }
      ).environment?.config?.consumer;
      if (!isBuild || consumer !== "server") return;
      for (const output of Object.values(bundle)) {
        if (
          output.type !== "chunk" ||
          !output.code.includes(SERVER_FUNCTION_MANIFEST_SENTINEL)
        )
          continue;
        const manifest: Record<string, string> = {};
        for (const [functionId, fileReference] of implementationChunkRefs) {
          let path = relative(
            dirname(output.fileName),
            this.getFileName(fileReference),
          ).replace(/\\/g, "/");
          if (!path.startsWith(".")) path = `./${path}`;
          manifest[functionId] = path;
        }
        const marker = JSON.stringify(SERVER_FUNCTION_MANIFEST_SENTINEL);
        const markerIndex = output.code.indexOf(marker);
        if (markerIndex < 0)
          this.error(
            "[Vynn use server] Could not inject the production function manifest.",
          );
        output.code =
          output.code.slice(0, markerIndex) +
          JSON.stringify(JSON.stringify(manifest)) +
          output.code.slice(markerIndex + marker.length);
      }
    },

    configureServer(server: ViteDevServer) {
      registerServerFunctionDevMiddleware(server, {
        endpoint: resolvedEndpoint,
        allowedOrigins,
        maxRequestBytes,
        exposeErrors: options.exposeErrors,
        isDevelopment,
        refsById,
      });
    },

    getServerFunctions() {
      return [...refsById.values()];
    },
  };

  return plugin;
}

export type { VynnServerFunctionsOptions };
