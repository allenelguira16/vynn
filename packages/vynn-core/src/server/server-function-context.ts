import { AsyncLocalStorage } from "node:async_hooks";

export type ServerFunctionCookieOptions = {
  domain?: string;
  expires?: Date;
  httpOnly?: boolean;
  maxAge?: number;
  path?: string;
  sameSite?: "Strict" | "Lax" | "None";
  secure?: boolean;
};

type RequestContextCookies = {
  get(name: string): string | undefined;
  set(name: string, value: string, options?: ServerFunctionCookieOptions): void;
  delete(
    name: string,
    options?: Omit<ServerFunctionCookieOptions, "expires" | "maxAge">,
  ): void;
};

/**
 * Request-scoped data available during SSR and server-function execution.
 *
 * The context is created by the Vynn server runtime. Application code should
 * only read the active context through getRequestContext().
 */
export type RequestContext = {
  /** The incoming HTTP request for this SSR render or server-function call. */
  readonly request: Request;
  /** Stable server-function ID, or null outside a specific function invocation. */
  readonly functionId: string | null;
  /** Aborted when the client cancels or disconnects from the request. */
  readonly signal: AbortSignal;
  /** Mutable metadata that the runtime applies to the outgoing response. */
  readonly response: {
    status: number;
    headers: Headers;
  };
  /** Helpers for reading incoming cookies and writing outgoing cookies. */
  readonly cookies: RequestContextCookies;
  /** Values shared by middleware, SSR, and server functions for this request. */
  readonly locals: Map<unknown, unknown>;
};

type ServerFunctionContext = RequestContext;

type ServerFunctionContextInput = {
  request: Request;
  functionId?: string | null;
  signal?: AbortSignal;
  response?: {
    status?: number;
    headers?: HeadersInit;
  };
  locals?: Map<unknown, unknown>;
};

// Vite can load the RPC runtime and a server function through distinct SSR
// module graphs. Keep one async context store per Node.js realm so both module
// instances observe the same active request scope without sharing request data.
const requestContextStorageKey = Symbol.for("vynn.server-function-context.v1");
const globalStorage = globalThis as typeof globalThis & Record<symbol, unknown>;
const existingStorage = globalStorage[requestContextStorageKey];

if (existingStorage !== undefined && !(existingStorage instanceof AsyncLocalStorage)) {
  throw new Error("[Vynn] The global request-context storage key is already occupied.");
}

const serverFunctionContext =
  (existingStorage as AsyncLocalStorage<ServerFunctionContext> | undefined) ??
  new AsyncLocalStorage<ServerFunctionContext>();

if (existingStorage === undefined) {
  Object.defineProperty(globalThis, requestContextStorageKey, {
    configurable: false,
    enumerable: false,
    value: serverFunctionContext,
    writable: false,
  });
}
const createdContexts = new WeakSet<object>();

function validateServerFunctionResponseStatus(status: number): void {
  if (!Number.isInteger(status) || status < 200 || status > 299 || status === 204 || status === 205) {
    throw new RangeError(
      "[Vynn] Request context response status must be a body-bearing 2xx status. Throw ServerFunctionError for failures.",
    );
  }
}

function readRequestCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;

    const value = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return undefined;
}

function serializeCookie(name: string, value: string, options: ServerFunctionCookieOptions): string {
  if (!/^[!#$%&'*+.^_|~0-9A-Za-z-]+$/.test(name)) {
    throw new TypeError("[Vynn] Invalid cookie name.");
  }

  const parts = [name + "=" + encodeURIComponent(value)];

  if (options.maxAge !== undefined) {
    if (!Number.isInteger(options.maxAge)) {
      throw new TypeError("[Vynn] Cookie maxAge must be an integer.");
    }
    parts.push("Max-Age=" + options.maxAge);
  }

  if (options.domain) {
    if (/[\r\n;]/.test(options.domain)) throw new TypeError("[Vynn] Invalid cookie domain.");
    parts.push("Domain=" + options.domain);
  }

  if (options.path) {
    if (/[\r\n;]/.test(options.path)) throw new TypeError("[Vynn] Invalid cookie path.");
    parts.push("Path=" + options.path);
  }

  if (options.expires) {
    if (Number.isNaN(options.expires.getTime())) {
      throw new TypeError("[Vynn] Cookie expires must be a valid date.");
    }
    parts.push("Expires=" + options.expires.toUTCString());
  }

  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");

  if (options.sameSite) {
    if (!["Strict", "Lax", "None"].includes(options.sameSite)) {
      throw new TypeError("[Vynn] Invalid cookie SameSite option.");
    }
    parts.push("SameSite=" + options.sameSite);
  }

  return parts.join("; ");
}

function appendResponseCookie(
  response: RequestContext["response"],
  name: string,
  value: string,
  options: ServerFunctionCookieOptions = {},
): void {
  response.headers.append("set-cookie", serializeCookie(name, value, options));
}

/** Creates isolated mutable context for one server-function or SSR request. */
export function createServerFunctionContext(
  input: ServerFunctionContextInput,
): RequestContext {
  let status = input.response?.status ?? 200;
  validateServerFunctionResponseStatus(status);

  const response: RequestContext["response"] = {
    get status() {
      return status;
    },
    set status(value: number) {
      validateServerFunctionResponseStatus(value);
      status = value;
    },
    headers: new Headers(input.response?.headers),
  };

  const context: RequestContext = {
    request: input.request,
    functionId: input.functionId ?? null,
    signal: input.signal ?? input.request.signal,
    response,
    cookies: {
      get(name) {
        return readRequestCookie(input.request, name);
      },
      set(name, value, options = {}) {
        appendResponseCookie(response, name, value, options);
      },
      delete(name, options = {}) {
        appendResponseCookie(response, name, "", {
          ...options,
          expires: new Date(0),
          maxAge: 0,
        });
      },
    },
    locals: input.locals ?? new Map(),
  };

  createdContexts.add(context);
  return context;
}

/** Runs a server request with request-local context that survives await. */
export function runWithServerFunctionContext<T>(
  context: RequestContext | ServerFunctionContextInput,
  callback: () => T,
): T {
  const normalized = createdContexts.has(context)
    ? context as RequestContext
    : createServerFunctionContext(context as ServerFunctionContextInput);

  return serverFunctionContext.run(normalized, callback);
}

/**
 * Adds the current server-function ID while preserving the active request,
 * response state, cookies, and request-local values.
 *
 * When called outside a request scope, the implementation runs unchanged.
 */
export function runWithServerFunctionInvocation<T>(
  functionId: string,
  callback: () => T,
): T {
  const current = serverFunctionContext.getStore();
  if (!current) return callback();

  return serverFunctionContext.run(
    {
      ...current,
      functionId,
    },
    callback,
  );
}

/** Returns the active SSR or server-function request context. */
export function getRequestContext(): RequestContext {
  const context = serverFunctionContext.getStore();
  if (!context) {
    throw new Error(
      "[Vynn] No request context is active. This API is only available during an SSR request or server-function invocation.",
    );
  }
  return context;
}
