import { createHash } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { parseSync, visitorKeys } from "oxc-parser";
import type { Plugin, ViteDevServer } from "vite";

type Node = any;

type ServerFunctionReference = {
  id: string;
  moduleId: string;
  exportName: string;
};

export type VynnServerFunctionsOptions = {
  /** HTTP endpoint called by client-side server references. Must be an absolute pathname. */
  endpoint?: string;
  /** Disable the transform while keeping the plugin registered. */
  enabled?: boolean;
  /** Maximum request body size in bytes. Defaults to 1 MiB. */
  maxRequestBytes?: number;
  /** Additional trusted browser origins, for apps behind a reverse proxy. Exact origins only. */
  allowedOrigins?: string[];
  /** Include thrown error messages in RPC responses. Defaults to true in dev and false in builds. */
  exposeErrors?: boolean;
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
const SERVER_FUNCTIONS_API_ID = "virtual:vynn/server-functions";
const RESOLVED_CLIENT_RUNTIME_ID = `\0${CLIENT_RUNTIME_ID}`;
const RESOLVED_SERVER_RUNTIME_ID = `\0${SERVER_RUNTIME_ID}`;
const RESOLVED_SERVER_FUNCTIONS_API_ID = `\0${SERVER_FUNCTIONS_API_ID}`;
const SERVER_FUNCTION_IMPL_PREFIX =
  "virtual:vynn/server-functions/implementation/";
const RESOLVED_SERVER_FUNCTION_IMPL_PREFIX = `\0${SERVER_FUNCTION_IMPL_PREFIX}`;
const SERVER_FUNCTION_MANIFEST_SENTINEL = "__VYNN_SERVER_FUNCTION_MANIFEST__";
const CREATE_SERVER_REFERENCE = "__vynnCreateServerReference";
const SCRIPT_EXTENSION_RE = /\.(?:[cm]?[jt]sx?)$/i;
const DEFAULT_ENDPOINT = "/__vynn/server-function";
const MAX_REQUEST_BYTES = 1024 * 1024;

function applyBaseToEndpoint(base: string, endpoint: string): string {
  if (base === "/" || base === "./") return endpoint;
  const prefix = base.startsWith("/") ? base.replace(/\/+$/, "") : "";
  return prefix ? `${prefix}${endpoint}` : endpoint;
}

function normalizeAllowedOrigin(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("[Vynn use server] Invalid allowed origin: " + value);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    throw new Error(
      "[Vynn use server] Allowed origins must use http or https: " + value,
    );
  return parsed.origin;
}

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

function makeServerRuntime(
  endpoint: string,
  options: {
    maxRequestBytes: number;
    allowedOrigins: string[];
    exposeErrors: boolean;
    development: boolean;
    manifestSentinel: string;
  },
): string {
  const runtime = `
  import { runWithServerFunctionContext } from "vynn/server";
  const endpoint = __ENDPOINT__;
  const endpointPath = new URL(endpoint, "http://vynn.local").pathname;
  const maxRequestBytes = __MAX_REQUEST_BYTES__;
  const allowedOrigins = new Set(__ALLOWED_ORIGINS__);
  const exposeErrors = __EXPOSE_ERRORS__;
  const development = __DEVELOPMENT__;
  const deploymentManifestJson = "__VYNN_SERVER_FUNCTION_MANIFEST__";
  let deploymentManifest = {};
  try { deploymentManifest = JSON.parse(deploymentManifestJson); } catch {}
  const implementations = new Map();
  function jsonResponse(status, body) {
    return new Response(JSON.stringify(body), {
      status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff"
      }
    });
  }
  function makeError(message, statusCode) { const error = new Error(message); error.statusCode = statusCode; return error; }
  function isAllowedOrigin(origin, requestUrl) {
    if (!origin) return false;
    try {
      const parsed = new URL(origin);
      if (parsed.origin !== origin) return false;
      return parsed.origin === new URL(requestUrl).origin || allowedOrigins.has(parsed.origin);
    } catch { return false; }
  }
  async function readRequestBody(request) {
    const size = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(size) && size > maxRequestBytes) throw makeError("Request body too large.", 413);
    if (!request.body) return "";
    const reader = request.body.getReader();
    const chunks = [];
    let total = 0;
    try {
      while (true) {
        const result = await reader.read();
        if (result.done) break;
        total += result.value.byteLength;
        if (total > maxRequestBytes) {
          await reader.cancel().catch(() => {});
          throw makeError("Request body too large.", 413);
        }
        chunks.push(result.value);
      }
    } finally { try { reader.releaseLock(); } catch {} }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  }
  export function createServerReference(implementation, id) {
    if (typeof implementation !== "function" || typeof id !== "string") throw new TypeError("Invalid Vynn server-function reference.");
    implementations.set(id, implementation);
    return (...args) => implementation(...args);
  }
  async function loadImplementation(id) {
    if (development) {
      const registered = implementations.get(id);
      if (typeof registered === "function") return registered;
    }
    const path = deploymentManifest[id];
    if (typeof path !== "string") return undefined;
    const mod = await import(/* @vite-ignore */ new URL(path, import.meta.url).href);
    if (typeof mod.default !== "function") throw new Error("Invalid Vynn server-function entry chunk.");
    implementations.set(id, mod.default);
    return mod.default;
  }
  export async function invokeServerFunction(id, args, request, directImplementation) {
    const implementation = directImplementation ?? await loadImplementation(id);
    if (typeof implementation !== "function") throw makeError("Unknown Vynn server function.", 404);
    return await runWithServerFunctionContext({ request, functionId: id }, () => implementation(...args));
  }
  export async function handleServerFunctionRequest(request) {
    let url;
    try { url = new URL(request.url); } catch { return null; }
    if (url.pathname !== endpointPath) return null;
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ ok: false, error: "Method Not Allowed" }), {
        status: 405,
        headers: { allow: "POST", "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" }
      });
    }
    if (!isAllowedOrigin(request.headers.get("origin"), request.url)) return jsonResponse(403, { ok: false, error: "Cross-origin request rejected." });
    const type = (request.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase();
    if (type !== "application/json") return jsonResponse(415, { ok: false, error: "Expected application/json." });
    const requestForContext = request.clone();
    let payload;
    try { payload = JSON.parse(await readRequestBody(request)); }
    catch (error) {
      const large = error && error.statusCode === 413;
      return jsonResponse(large ? 413 : 400, { ok: false, error: large ? "Request body too large." : "Invalid JSON request body." });
    }
    if (!payload || typeof payload !== "object" || typeof payload.id !== "string" || !/^vynn_[a-f0-9]{20}$/.test(payload.id) || !Array.isArray(payload.args) || payload.args.length > 100) {
      return jsonResponse(400, { ok: false, error: "Invalid server-function request." });
    }
    if (typeof deploymentManifest[payload.id] !== "string" && !(development && implementations.has(payload.id))) return jsonResponse(404, { ok: false, error: "Unknown Vynn server function." });
    let value;
    try { value = await invokeServerFunction(payload.id, payload.args, requestForContext); }
    catch (error) {
      const message = exposeErrors && error instanceof Error ? error.message : "Server function failed.";
      return jsonResponse(500, { ok: false, error: message });
    }
    let body;
    try { body = JSON.stringify({ ok: true, value }); }
    catch { return jsonResponse(500, { ok: false, error: "Server function returned a non-serializable value." }); }
    return new Response(body ?? JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" }
    });
  }
  export function getRegisteredServerFunctionIds() { return [...implementations.keys()];
  }
  
  `;
  return runtime
    .replace("__ENDPOINT__", JSON.stringify(endpoint))
    .replace("__MAX_REQUEST_BYTES__", String(options.maxRequestBytes))
    .replace("__ALLOWED_ORIGINS__", JSON.stringify(options.allowedOrigins))
    .replace("__EXPOSE_ERRORS__", JSON.stringify(options.exposeErrors))
    .replace("__DEVELOPMENT__", JSON.stringify(options.development))
    .replace("__VYNN_SERVER_FUNCTION_MANIFEST__", options.manifestSentinel);
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
  _source: string,
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

async function readLimitedBody(
  request: IncomingMessage,
  maxBytes = MAX_REQUEST_BYTES,
): Promise<string> {
  const contentLength = Number(request.headers["content-length"] ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    const error = new Error("Request body too large.");
    (error as Error & { statusCode?: number }).statusCode = 413;
    throw error;
  }

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > maxBytes) {
      const error = new Error("Request body too large.");
      (error as Error & { statusCode?: number }).statusCode = 413;
      throw error;
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function createServerFunctionRequest(
  request: IncomingMessage,
  body: string,
): Request {
  const encrypted = Boolean(
    (request.socket as { encrypted?: boolean }).encrypted,
  );
  const origin = `${encrypted ? "https" : "http"}://${request.headers.host ?? "localhost"}`;
  const url = new URL(request.url ?? "/", origin);
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (
      key.toLowerCase() === "content-length" ||
      key.toLowerCase() === "transfer-encoding"
    )
      continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else if (value !== undefined) headers.set(key, value);
  }
  return new Request(url, { method: "POST", headers, body });
}
function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: Record<string, unknown>,
): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.setHeader("x-content-type-options", "nosniff");
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
 * RPC is wired into Vite dev middleware. The virtual module
 * `virtual:vynn/server-functions` exposes `handleServerFunctionRequest` for
 * production custom SSR servers, and Vynn Start integrates it automatically.
 * Production SSR builds emit implementation chunks and a dispatch manifest.
 * Function closures are not serialized.
 */
export function vynnServerFunctionsPlugin(
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
      server.middlewares.use((request, response, next) => {
        const pathname = new URL(request.url ?? "/", "http://vynn.local")
          .pathname;
        if (pathname !== resolvedEndpoint) {
          next();
          return;
        }

        void (async () => {
          if (request.method !== "POST") {
            response.setHeader("allow", "POST");
            sendJson(response, 405, { ok: false, error: "Method Not Allowed" });
            return;
          }

          const contentType = (request.headers["content-type"] ?? "")
            .split(";", 1)[0]
            .trim()
            .toLowerCase();
          if (contentType !== "application/json") {
            sendJson(response, 415, {
              ok: false,
              error: "Expected application/json.",
            });
            return;
          }

          const origin = request.headers.origin;
          const encrypted = Boolean(
            (request.socket as { encrypted?: boolean }).encrypted,
          );
          const expectedOrigin = `${encrypted ? "https" : "http"}://${request.headers.host ?? "localhost"}`;
          if (
            !origin ||
            (origin !== expectedOrigin && !allowedOrigins.includes(origin))
          ) {
            sendJson(response, 403, {
              ok: false,
              error: "Cross-origin request rejected.",
            });
            return;
          }

          let payload: unknown;
          let requestBody = "";
          try {
            requestBody = await readLimitedBody(request, maxRequestBytes);
            payload = JSON.parse(requestBody);
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
            !/^vynn_[a-f0-9]{20}$/.test((payload as { id: string }).id) ||
            !Array.isArray((payload as { args?: unknown }).args) ||
            (payload as { args: unknown[] }).args.length > 100
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
            if (typeof implementation !== "function")
              throw new Error("Vynn server implementation is not exported.");
            const runtimeModule = ssrEnvironment?.runner
              ? await ssrEnvironment.runner.import(SERVER_RUNTIME_ID)
              : await (
                  server as unknown as {
                    ssrLoadModule: (
                      id: string,
                    ) => Promise<Record<string, unknown>>;
                  }
                ).ssrLoadModule(SERVER_RUNTIME_ID);
            const invoke = runtimeModule.invokeServerFunction;
            if (typeof invoke !== "function")
              throw new Error("Vynn server-function runtime is not available.");
            const contextRequest = createServerFunctionRequest(
              request,
              requestBody,
            );
            const value = await (
              invoke as (
                id: string,
                args: unknown[],
                request: Request,
                implementation: (...args: unknown[]) => unknown,
              ) => Promise<unknown>
            )(
              functionId,
              args,
              contextRequest,
              implementation as (...args: unknown[]) => unknown,
            );
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
            response.setHeader("x-content-type-options", "nosniff");
            response.end(serialized ?? JSON.stringify({ ok: true }));
          } catch (error) {
            sendJson(response, 500, {
              ok: false,
              error:
                (options.exposeErrors ?? isDevelopment) &&
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
              (options.exposeErrors ?? isDevelopment) && error instanceof Error
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
