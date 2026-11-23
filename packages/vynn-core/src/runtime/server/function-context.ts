import "./context";

import {
  createRuntimeContext,
  getContext,
  getRuntimeContextStore,
  runWithRuntimeContext,
  runWithRuntimeContextScope,
  setContext,
} from "../context";

export type ServerFunctionCookieOptions = {
  domain?: string;
  expires?: Date;
  httpOnly?: boolean;
  maxAge?: number;
  path?: string;
  sameSite?: "Strict" | "Lax" | "None";
  secure?: boolean;
};

/** A Map with typed reads for values associated with request-local keys. */
export class RequestContextLocals extends Map<unknown, unknown> {
  override get<T = unknown>(key: unknown): T | undefined {
    return super.get(key) as T | undefined;
  }

  override set<T>(key: unknown, value: T): this {
    return super.set(key, value);
  }
}

type RequestContextCookies = {
  get(name: string): string | undefined;
  set(name: string, value: string, options?: ServerFunctionCookieOptions): void;
  delete(name: string, options?: Omit<ServerFunctionCookieOptions, "expires" | "maxAge">): void;
};

/**
 * Request-scoped data available during middleware, SSR, and server-function execution.
 *
 * The context is created by the Vynn server runtime. Application code should
 * read the active context through getRequestContext().
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
  readonly locals: RequestContextLocals;
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

const REQUEST_CONTEXT = Symbol.for("vynn.server-function-context");
const createdContexts = new WeakSet<object>();
const responseStatusOverrides = new WeakSet<object>();

function validateServerFunctionResponseStatus(status: number): void {
  if (
    !Number.isInteger(status) ||
    status < 200 ||
    status > 299 ||
    status === 204 ||
    status === 205
  ) {
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

function serializeCookie(
  name: string,
  value: string,
  options: ServerFunctionCookieOptions,
): string {
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
export function createServerFunctionContext(input: ServerFunctionContextInput): RequestContext {
  let status = input.response?.status ?? 200;
  validateServerFunctionResponseStatus(status);

  const response: RequestContext["response"] = {
    get status() {
      return status;
    },
    set status(value: number) {
      validateServerFunctionResponseStatus(value);
      status = value;
      responseStatusOverrides.add(response);
    },
    headers: new Headers(input.response?.headers),
  };

  const locals =
    input.locals instanceof RequestContextLocals
      ? input.locals
      : new RequestContextLocals(input.locals);

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
    locals,
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
    ? (context as RequestContext)
    : createServerFunctionContext(context as ServerFunctionContextInput);

  const parent = getRuntimeContextStore() ?? null;

  return runWithRuntimeContext(createRuntimeContext(parent), () => {
    setContext(REQUEST_CONTEXT, normalized);
    return callback();
  });
}

/**
 * Adds the current server-function ID while preserving the active request,
 * response state, cookies, and request-local values.
 *
 * When called outside a request scope, the implementation runs unchanged.
 */
export function runWithServerFunctionInvocation<T>(functionId: string, callback: () => T): T {
  const current = getContext<RequestContext>(REQUEST_CONTEXT);
  if (!current) return callback();

  return runWithRuntimeContextScope(() => {
    setContext(REQUEST_CONTEXT, {
      ...current,
      functionId,
    });
    return callback();
  });
}

/** Returns the active SSR or server-function request context. */
export function getRequestContext(): RequestContext {
  const context = getContext<RequestContext>(REQUEST_CONTEXT);
  if (!context) {
    throw new Error(
      "[Vynn] No request context is active. This API is only available during a Vynn server request or server-function invocation.",
    );
  }
  return context;
}

/** Returns the active request context without throwing when no request is active. */
export function getCurrentRequestContext(): RequestContext | undefined {
  return getContext<RequestContext>(REQUEST_CONTEXT);
}

/**
 * Runs work inside a request context, reusing the active context when it
 * already belongs to the same Request object.
 */
export function runWithRequestContext<T>(
  request: Request,
  callback: (context: RequestContext) => T,
): T {
  const current = getCurrentRequestContext();
  if (current?.request === request) return callback(current);

  const context = createServerFunctionContext({ request });
  return runWithServerFunctionContext(context, () => callback(context));
}

function getSetCookieValues(headers: Headers): string[] {
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  if (typeof getSetCookie === "function") {
    const values = getSetCookie.call(headers);
    if (values.length > 0) return values;
  }

  const value = headers.get("set-cookie");
  return value ? [value] : [];
}

/**
 * Applies request-scoped response metadata to a response returned by
 * middleware, SSR, or a server function.
 */
export function applyRequestContextResponse(
  response: Response,
  context: RequestContext,
): Response {
  const additionalHeaders: string[] = [];
  context.response.headers.forEach((_value, name) => additionalHeaders.push(name));

  const hasStatusOverride = responseStatusOverrides.has(context.response);
  if (!hasStatusOverride && additionalHeaders.length === 0) return response;

  const headers = new Headers(response.headers);
  const contextCookies = getSetCookieValues(context.response.headers);

  context.response.headers.forEach((value, name) => {
    if (name.toLowerCase() !== "set-cookie") headers.set(name, value);
  });

  const existingCookies = getSetCookieValues(headers);
  for (const cookie of contextCookies) {
    if (!existingCookies.includes(cookie)) {
      headers.append("set-cookie", cookie);
      existingCookies.push(cookie);
    }
  }

  const status = hasStatusOverride ? context.response.status : response.status;
  const bodyless = status === 204 || status === 205 || status === 304;

  if (bodyless && response.body) {
    void response.body.cancel().catch(() => undefined);
  }

  return new Response(bodyless ? null : response.body, {
    status,
    statusText: response.statusText,
    headers,
  });
}
