import { createHash } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { isAbsolute, relative, resolve } from "node:path";
import { parseSync, visitorKeys } from "oxc-parser";
import type { Plugin, ViteDevServer } from "vite";

type Node = any;

type ServerFunctionReference = {
  id: string;
  moduleId: string;
  exportName: string;
};

export type VynnServerFunctionsOptions = {
  /** HTTP endpoint called by client-side server references. */
  endpoint?: string;
  /** Disable the transform while keeping the plugin registered. */
  enabled?: boolean;
};

type VynnServerFunctionsPlugin = Plugin & {
  /** Current server-function manifest. Useful for production integration. */
  getServerFunctions(): ServerFunctionReference[];
};

type MarkedFunction = {
  fn: Node;
  directive: Node;
  parent: Node | null;
  ordinal: number;
  id: string;
  exportName: string;
};

type SourceEdit = { start: number; end: number; content: string };

const CLIENT_RUNTIME_ID = "virtual:vynn/server-functions/client-runtime";
const SERVER_RUNTIME_ID = "virtual:vynn/server-functions/server-runtime";
const RESOLVED_CLIENT_RUNTIME_ID = `\0${CLIENT_RUNTIME_ID}`;
const RESOLVED_SERVER_RUNTIME_ID = `\0${SERVER_RUNTIME_ID}`;
const CREATE_SERVER_REFERENCE = "__vynnCreateServerReference";
const SCRIPT_EXTENSION_RE = /\.(?:[cm]?[jt]sx?)$/i;
const DEFAULT_ENDPOINT = "/__vynn/server-function";
const MAX_REQUEST_BYTES = 1024 * 1024;

const isNode = (value: unknown): value is Node =>
  !!value &&
  typeof value === "object" &&
  typeof (value as Node).type === "string";

function childrenOf(node: Node, visit: (child: Node) => void): void {
  const keys = (visitorKeys as Record<string, string[]>)[node.type] ?? [];
  for (const key of keys) {
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) if (isNode(child)) visit(child);
    } else if (isNode(value)) {
      visit(value);
    }
  }
}

function getDirectiveValue(statement: Node): string | undefined {
  if (typeof statement?.directive === "string") return statement.directive;
  if (statement?.type !== "ExpressionStatement") return undefined;

  const expression = statement.expression;
  if (
    (expression?.type === "Literal" || expression?.type === "StringLiteral") &&
    typeof expression.value === "string"
  ) {
    return expression.value;
  }
  return undefined;
}

function getUseServerDirective(fn: Node): Node | undefined {
  if (fn?.body?.type !== "BlockStatement") return undefined;

  for (const statement of fn.body.body as Node[]) {
    const value = getDirectiveValue(statement);
    if (value === "use server") return statement;
    // A function directive must occur in the directive prologue.
    if (value === undefined) break;
  }
  return undefined;
}

function isFunctionNode(node: Node): boolean {
  return (
    node?.type === "FunctionDeclaration" ||
    node?.type === "FunctionExpression" ||
    node?.type === "ArrowFunctionExpression"
  );
}

function inferParserLanguage(id: string): "js" | "jsx" | "ts" | "tsx" {
  if (/\.tsx$/i.test(id)) return "tsx";
  if (/\.(?:ts|mts|cts)$/i.test(id)) return "ts";
  return "jsx";
}

function cleanModuleId(id: string): string {
  return id.split("?", 1)[0].replace(/\\/g, "/");
}

function stableDigest(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 20);
}

function getModuleKey(root: string, moduleId: string): string {
  const absolute = resolve(moduleId);
  const relativeId = relative(root, absolute).replace(/\\/g, "/");
  if (
    relativeId === ".." ||
    relativeId.startsWith("../") ||
    isAbsolute(relativeId)
  ) {
    throw new Error(
      `[Vynn use server] Server functions must be declared inside the Vite project root. Received: ${moduleId}`,
    );
  }
  return relativeId;
}

function applyEdits(source: string, edits: SourceEdit[]): string {
  const sorted = [...edits].sort((a, b) => b.start - a.start);
  let result = source;
  let previousStart = source.length + 1;

  for (const edit of sorted) {
    if (edit.start < 0 || edit.end < edit.start || edit.end > source.length) {
      throw new Error(
        "[Vynn use server] Internal compiler error: invalid source edit.",
      );
    }
    if (edit.end > previousStart) {
      throw new Error(
        "[Vynn use server] A server-marked function contains another server-marked function. Nested server boundaries are not supported yet.",
      );
    }
    result =
      result.slice(0, edit.start) + edit.content + result.slice(edit.end);
    previousStart = edit.start;
  }
  return result;
}

function makeClientRuntime(endpoint: string): string {
  return `const endpoint = ${JSON.stringify(endpoint)};

async function invokeServerFunction(id, args) {
  const response = await fetch(endpoint, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      "accept": "application/json"
    },
    body: JSON.stringify({ id, args })
  });

  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }

  if (!response.ok || !payload || payload.ok !== true) {
    throw new Error(
      typeof payload?.error === "string"
        ? payload.error
        : "Vynn server function request failed (" + response.status + ")."
    );
  }

  return payload.value;
}

export function createServerReference(id) {
  const reference = (...args) => invokeServerFunction(id, args);
  Object.defineProperty(reference, "name", { value: "serverReference" });
  return reference;
}
`;
}

function makeServerRuntime(): string {
  return `export function createServerReference(implementation) {
  return (...args) => implementation(...args);
}
`;
}

function getParamsSource(source: string, fn: Node): string {
  const params = (fn.params ?? []) as Node[];
  return params.map((param) => source.slice(param.start, param.end)).join(", ");
}

function getTypeParametersSource(source: string, fn: Node): string {
  const typeParameters = fn.typeParameters ?? fn.typeParams;
  if (
    typeParameters &&
    typeof typeParameters.start === "number" &&
    typeof typeParameters.end === "number"
  ) {
    return source.slice(typeParameters.start, typeParameters.end);
  }
  return "";
}

function makeExtractedImplementation(
  source: string,
  marked: MarkedFunction,
): string {
  const { fn, directive, exportName } = marked;
  const body = fn.body as Node;
  const bodySource =
    source.slice(body.start, directive.start) +
    source.slice(directive.end, body.end);
  const typeParameters = getTypeParametersSource(source, fn);
  const params = getParamsSource(source, fn);
  const asyncPrefix = fn.async ? "async " : "";

  return `export ${asyncPrefix}function ${exportName}${typeParameters}(${params}) ${bodySource}`;
}

function makeReferenceCall(marked: MarkedFunction, isServer: boolean): string {
  return isServer
    ? `${CREATE_SERVER_REFERENCE}(${marked.exportName}, ${JSON.stringify(marked.id)})`
    : `${CREATE_SERVER_REFERENCE}(${JSON.stringify(marked.id)})`;
}

function makeReplacement(
  marked: MarkedFunction,
  isServer: boolean,
): SourceEdit {
  const { fn, parent } = marked;
  const reference = makeReferenceCall(marked, isServer);

  if (fn.type !== "FunctionDeclaration") {
    return { start: fn.start, end: fn.end, content: reference };
  }

  const name = fn.id?.name;
  if (!name) {
    throw new Error(
      "[Vynn use server] Anonymous function declarations with a directive are not supported. Assign the function a name.",
    );
  }

  if (parent?.type === "ExportNamedDeclaration") {
    return {
      start: parent.start,
      end: parent.end,
      content: `export const ${name} = ${reference};`,
    };
  }

  if (parent?.type === "ExportDefaultDeclaration") {
    return {
      start: parent.start,
      end: parent.end,
      content: `const ${name} = ${reference};\nexport default ${name};`,
    };
  }

  return {
    start: fn.start,
    end: fn.end,
    content: `const ${name} = ${reference};`,
  };
}

function collectMarkedFunctions(
  program: Node,
  source: string,
  root: string,
  moduleId: string,
): MarkedFunction[] {
  const found: Array<{ fn: Node; directive: Node; parent: Node | null }> = [];
  const parents = new WeakMap<object, Node>();

  const walk = (node: Node, parent: Node | null): void => {
    if (!isNode(node)) return;
    if (parent) parents.set(node, parent);
    if (isFunctionNode(node)) {
      const directive = getUseServerDirective(node);
      if (directive) found.push({ fn: node, directive, parent });
    }
    childrenOf(node, (child) => walk(child, node));
  };
  walk(program, null);

  const moduleKey = getModuleKey(root, moduleId);
  return found.map((item, ordinal) => {
    if (item.fn.generator) {
      throw new Error(
        `[Vynn use server] Generator functions are not supported (${moduleKey}).`,
      );
    }

    const token = `${moduleKey}#${ordinal}`;
    const digest = stableDigest(token);
    return {
      ...item,
      ordinal,
      id: `vynn_${digest}`,
      exportName: `__vynn_server_fn_${digest}`,
      parent: parents.get(item.fn) ?? item.parent,
    };
  });
}

function containsNestedMarkedBoundary(
  marked: MarkedFunction[],
  program: Node,
): boolean {
  const markedNodes = new Set(marked.map((item) => item.fn));
  const parentMap = new WeakMap<object, Node>();
  const walk = (node: Node): void => {
    if (!isNode(node)) return;
    childrenOf(node, (child) => {
      parentMap.set(child, node);
      walk(child);
    });
  };
  walk(program);

  for (const item of marked) {
    let ancestor = parentMap.get(item.fn);
    while (ancestor) {
      if (markedNodes.has(ancestor)) return true;
      ancestor = parentMap.get(ancestor);
    }
  }
  return false;
}

async function readLimitedBody(request: IncomingMessage): Promise<string> {
  const contentLength = Number(request.headers["content-length"] ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    const error = new Error("Request body too large.");
    (error as Error & { statusCode?: number }).statusCode = 413;
    throw error;
  }

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > MAX_REQUEST_BYTES) {
      const error = new Error("Request body too large.");
      (error as Error & { statusCode?: number }).statusCode = 413;
      throw error;
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: Record<string, unknown>,
): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify(body));
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
 * RPC is wired into Vite dev middleware. Production runtimes should consume
 * getServerFunctions() and dispatch the same IDs from their server handler.
 */
export function vynnServerFunctionsPlugin(
  options: VynnServerFunctionsOptions = {},
): VynnServerFunctionsPlugin {
  const endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
  let projectRoot = process.cwd();
  const refsByModule = new Map<string, ServerFunctionReference[]>();
  const refsById = new Map<string, ServerFunctionReference>();

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
    name: "vynn:server-functions",
    enforce: "pre",

    configResolved(config) {
      projectRoot = config.root;
    },

    resolveId(id) {
      if (id === CLIENT_RUNTIME_ID) return RESOLVED_CLIENT_RUNTIME_ID;
      if (id === SERVER_RUNTIME_ID) return RESOLVED_SERVER_RUNTIME_ID;
      return null;
    },

    load(id) {
      if (id === RESOLVED_CLIENT_RUNTIME_ID) return makeClientRuntime(endpoint);
      if (id === RESOLVED_SERVER_RUNTIME_ID) return makeServerRuntime();
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

      if (!marked || marked.length === 0) {
        const moduleDirective = (program.body as Node[]).find(
          (statement) => getDirectiveValue(statement) === "use server",
        );
        if (moduleDirective) {
          this.error(
            `[Vynn use server] File-level "use server" is not supported yet. Put the directive inside a function body (${cleanId}).`,
          );
        }
        return null;
      }

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

    configureServer(server: ViteDevServer) {
      server.middlewares.use((request, response, next) => {
        const pathname = new URL(request.url ?? "/", "http://vynn.local")
          .pathname;
        if (pathname !== endpoint) {
          next();
          return;
        }

        void (async () => {
          if (request.method !== "POST") {
            response.setHeader("allow", "POST");
            sendJson(response, 405, { ok: false, error: "Method Not Allowed" });
            return;
          }

          const contentType = request.headers["content-type"] ?? "";
          if (!contentType.toLowerCase().startsWith("application/json")) {
            sendJson(response, 415, {
              ok: false,
              error: "Expected application/json.",
            });
            return;
          }

          const origin = request.headers.origin;
          if (origin) {
            const encrypted = Boolean(
              (request.socket as { encrypted?: boolean }).encrypted,
            );
            const expectedOrigin = `${encrypted ? "https" : "http"}://${request.headers.host ?? "localhost"}`;
            if (origin !== expectedOrigin) {
              sendJson(response, 403, {
                ok: false,
                error: "Cross-origin request rejected.",
              });
              return;
            }
          }

          let payload: unknown;
          try {
            payload = JSON.parse(await readLimitedBody(request));
          } catch (error) {
            const statusCode =
              (error as Error & { statusCode?: number }).statusCode ?? 400;
            sendJson(response, statusCode, {
              ok: false,
              error:
                statusCode === 413
                  ? "Request body too large."
                  : "Invalid JSON request body.",
            });
            return;
          }

          if (
            !payload ||
            typeof payload !== "object" ||
            typeof (payload as { id?: unknown }).id !== "string" ||
            !Array.isArray((payload as { args?: unknown }).args)
          ) {
            sendJson(response, 400, {
              ok: false,
              error: "Expected { id: string, args: unknown[] }.",
            });
            return;
          }

          const functionId = (payload as { id: string }).id;
          const args = (payload as { args: unknown[] }).args;
          const reference = refsById.get(functionId);
          if (!reference) {
            sendJson(response, 404, {
              ok: false,
              error: "Unknown Vynn server function.",
            });
            return;
          }

          try {
            const environments = (
              server as unknown as {
                environments?: Record<
                  string,
                  {
                    runner?: {
                      import: (id: string) => Promise<Record<string, unknown>>;
                    };
                  }
                >;
                ssrLoadModule?: (
                  id: string,
                ) => Promise<Record<string, unknown>>;
              }
            ).environments;
            const ssrEnvironment = environments?.ssr;
            const moduleExports = ssrEnvironment?.runner
              ? await ssrEnvironment.runner.import(reference.moduleId)
              : await (
                  server as unknown as {
                    ssrLoadModule: (
                      id: string,
                    ) => Promise<Record<string, unknown>>;
                  }
                ).ssrLoadModule(reference.moduleId);

            const implementation = moduleExports[reference.exportName];
            if (typeof implementation !== "function") {
              throw new Error(
                `Server implementation ${reference.exportName} was not exported by ${reference.moduleId}.`,
              );
            }

            const value = await (
              implementation as (...args: unknown[]) => unknown
            )(...args);
            let serialized: string;
            try {
              serialized = JSON.stringify({ ok: true, value });
            } catch {
              sendJson(response, 500, {
                ok: false,
                error: "Server function returned a non-serializable value.",
              });
              return;
            }

            response.statusCode = 200;
            response.setHeader(
              "content-type",
              "application/json; charset=utf-8",
            );
            response.setHeader("cache-control", "no-store");
            response.end(serialized ?? JSON.stringify({ ok: true }));
          } catch (error) {
            sendJson(response, 500, {
              ok: false,
              error:
                error instanceof Error
                  ? error.message
                  : "Server function failed.",
            });
          }
        })().catch((error: unknown) => {
          if (response.headersSent) {
            response.destroy(error instanceof Error ? error : undefined);
            return;
          }
          sendJson(response, 500, {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "Server function request failed.",
          });
        });
      });
    },

    getServerFunctions() {
      return [...refsById.values()];
    },
  };

  return plugin;
}
