import { runWithServerFunctionContext } from "../server/server-function-context.ts";
import {
  DEFAULT_MAX_SERVER_FUNCTION_REQUEST_BYTES,
  DEFAULT_SERVER_FUNCTION_ENDPOINT,
  MAX_SERVER_FUNCTION_REQUEST_BYTES,
  SERVER_FUNCTION_ID_RE,
} from "./constants.ts";
import {
  createServerFunctionResponse,
  isAllowedServerFunctionOrigin,
  normalizeServerFunctionOrigin,
  type ServerFunctionRequestPayload,
} from "./protocol.ts";

export type ServerFunctionImplementation = (...args: unknown[]) => unknown;

type CaptureAwareServerFunctionImplementation = (
  captures: unknown[],
  ...args: unknown[]
) => unknown;

type RegisteredServerFunction = {
  implementation: CaptureAwareServerFunctionImplementation;
  captureAware: boolean;
  getCaptures?: () => unknown[];
  originalImplementation?: ServerFunctionImplementation;
};

export type ServerFunctionResolver = (
  id: string,
) => ServerFunctionImplementation | undefined | Promise<ServerFunctionImplementation | undefined>;

export type ServerFunctionHandlerOptions = {
  /** Absolute pathname for the RPC endpoint. */
  endpoint?: string;
  /** Maximum accepted request body size. Defaults to 1 MiB. */
  maxRequestBytes?: number;
  /** Additional exact browser origins permitted to call this endpoint. */
  allowedOrigins?: string[];
  /** Include thrown error messages in responses. Defaults to the development setting. */
  exposeErrors?: boolean;
  /** Treat this handler as a development handler when selecting error details. */
  development?: boolean;
  /** Resolve a function ID to a custom server implementation. */
  resolve?: ServerFunctionResolver;
  /** Marks resolver results as compiler-generated implementations with a captures parameter. */
  resolveWithCaptures?: boolean;
};

const implementations = new Map<string, RegisteredServerFunction>();

/**
 * Registers a server implementation and returns its callable reference.
 *
 * Manually registered implementations are returned unchanged. Compiler-
 * generated implementations receive a wrapper that supplies their captures.
 * The registry is also used by development handlers after Vite has loaded the
 * module containing a server function.
 */
export function createServerReference<T extends (...args: never[]) => unknown>(
  implementation: T,
  id: string,
  getCaptures?: () => unknown[],
): T {
  if (typeof implementation !== "function" || !SERVER_FUNCTION_ID_RE.test(id)) {
    throw new TypeError("[Vynn] Invalid server-function implementation or ID.");
  }

  const invoke = implementation as (...args: unknown[]) => unknown;

  if (!getCaptures) {
    implementations.set(id, {
      implementation: (_captures, ...args) => invoke(...args),
      captureAware: false,
      originalImplementation: implementation,
    });
    return implementation;
  }

  const serverImplementation =
    implementation as unknown as CaptureAwareServerFunctionImplementation;
  implementations.set(id, {
    implementation: serverImplementation,
    captureAware: true,
    getCaptures,
  });

  const reference = (...args: unknown[]) =>
    serverImplementation(getCaptures(), ...args);

  Object.defineProperty(reference, "name", { value: "serverReference" });
  return reference as unknown as T;
}

/** Returns a server implementation previously registered by the compiler output. */
export function getServerFunctionImplementation(
  id: string,
): ServerFunctionImplementation | undefined {
  const registered = implementations.get(id);
  if (!registered) return undefined;

  if (!registered.captureAware) {
    return registered.originalImplementation;
  }

  return (...args) =>
    registered.implementation(registered.getCaptures?.() ?? [], ...args);
}

async function readRequestBody(request: Request, maxBytes: number): Promise<string> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw Object.assign(new Error("Request body too large."), { statusCode: 413 });
  }

  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;

      total += result.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw Object.assign(new Error("Request body too large."), { statusCode: 413 });
      }

      chunks.push(result.value);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // The reader may already have been released by cancellation.
    }
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function validateEndpoint(endpoint: string): void {
  if (
    !endpoint.startsWith("/") ||
    endpoint.startsWith("//") ||
    endpoint.includes("?") ||
    endpoint.includes("#")
  ) {
    throw new Error(
      "[Vynn server functions] endpoint must be an absolute pathname without a query or hash.",
    );
  }
}

/**
 * Creates a Fetch-compatible request handler for server-function RPC calls.
 *
 * The resolver is supplied by the build integration. When present, it is the
 * authoritative production allowlist. Runtime-registered implementations are
 * used only when no resolver is supplied, which is how development dispatch
 * remains independent of Vite's manifest format.
 */
export function createServerFunctionHandler(
  options: ServerFunctionHandlerOptions = {},
): (request: Request) => Promise<Response | null> {
  const endpoint = options.endpoint ?? DEFAULT_SERVER_FUNCTION_ENDPOINT;
  validateEndpoint(endpoint);

  const maxRequestBytes = options.maxRequestBytes ?? DEFAULT_MAX_SERVER_FUNCTION_REQUEST_BYTES;
  if (
    !Number.isSafeInteger(maxRequestBytes) ||
    maxRequestBytes < 1 ||
    maxRequestBytes > MAX_SERVER_FUNCTION_REQUEST_BYTES
  ) {
    throw new RangeError(
      `[Vynn server functions] maxRequestBytes must be a safe integer between 1 and ${MAX_SERVER_FUNCTION_REQUEST_BYTES}.`,
    );
  }

  const allowedOrigins = new Set((options.allowedOrigins ?? []).map(normalizeServerFunctionOrigin));
  const exposeErrors = options.exposeErrors ?? options.development ?? false;

  return async (request: Request): Promise<Response | null> => {
    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      return null;
    }

    if (url.pathname !== endpoint) return null;

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ ok: false, error: "Method Not Allowed" }), {
        status: 405,
        headers: {
          allow: "POST",
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        },
      });
    }

    if (
      !isAllowedServerFunctionOrigin(request.headers.get("origin"), request.url, allowedOrigins)
    ) {
      return createServerFunctionResponse(403, {
        ok: false,
        error: "Cross-origin request rejected.",
      });
    }

    const contentType = (request.headers.get("content-type") ?? "")
      .split(";", 1)[0]
      .trim()
      .toLowerCase();
    if (contentType !== "application/json") {
      return createServerFunctionResponse(415, {
        ok: false,
        error: "Expected application/json.",
      });
    }

    const requestForContext = request.clone();
    let payload: ServerFunctionRequestPayload;

    try {
      payload = JSON.parse(
        await readRequestBody(request, maxRequestBytes),
      ) as ServerFunctionRequestPayload;
    } catch (error) {
      const statusCode = (error as Error & { statusCode?: number }).statusCode === 413 ? 413 : 400;
      return createServerFunctionResponse(statusCode, {
        ok: false,
        error: statusCode === 413 ? "Request body too large." : "Invalid JSON request body.",
      });
    }

    if (
      !payload ||
      typeof payload !== "object" ||
      typeof payload.id !== "string" ||
      !SERVER_FUNCTION_ID_RE.test(payload.id) ||
      !Array.isArray(payload.args) ||
      payload.args.length > 100 ||
      (payload.captures !== undefined &&
        (!Array.isArray(payload.captures) || payload.captures.length > 100))
    ) {
      return createServerFunctionResponse(400, {
        ok: false,
        error: "Invalid server-function request.",
      });
    }

    try {
      const implementation = options.resolve
        ? await options.resolve(payload.id)
        : undefined;
      const registered = options.resolve
        ? undefined
        : implementations.get(payload.id);

      if (options.resolve && typeof implementation !== "function") {
        return createServerFunctionResponse(404, {
          ok: false,
          error: "Unknown Vynn server function.",
        });
      }

      if (!options.resolve && !registered) {
        return createServerFunctionResponse(404, {
          ok: false,
          error: "Unknown Vynn server function.",
        });
      }

      const value = await runWithServerFunctionContext(
        { request: requestForContext, functionId: payload.id },
        () => {
          if (options.resolve) {
            return options.resolveWithCaptures
              ? (implementation as unknown as CaptureAwareServerFunctionImplementation)(
                  payload.captures ?? [],
                  ...payload.args,
                )
              : (implementation as ServerFunctionImplementation)(...payload.args);
          }

          return registered!.implementation(
            registered!.captureAware ? payload.captures ?? [] : [],
            ...payload.args,
          );
        },
      );

      let body: string | undefined;
      try {
        body = JSON.stringify({ ok: true, value });
      } catch {
        return createServerFunctionResponse(500, {
          ok: false,
          error: "Server function returned a non-serializable value.",
        });
      }

      return new Response(body ?? JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        },
      });
    } catch (error) {
      return createServerFunctionResponse(500, {
        ok: false,
        error: exposeErrors && error instanceof Error ? error.message : "Server function failed.",
      });
    }
  };
}

export type { ServerFunctionRequestPayload } from "./protocol.ts";
