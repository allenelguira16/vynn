export function makeClientRuntime(endpoint: string): string {
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

export function makeServerRuntime(
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
