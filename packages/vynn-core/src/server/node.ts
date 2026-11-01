import { type IncomingMessage, type ServerResponse } from "node:http";
import { Readable } from "node:stream";

export type ToWebRequestOptions = {
  /**
   * Override the incoming URL. A callback is useful when mounting the
   * listener behind a framework that rewrites req.url.
   *
   * Express's originalUrl is detected automatically when available.
   */
  url?: string | ((request: IncomingMessage) => string);
  /**
   * Public origin used to resolve relative request URLs.
   * Set this when running behind a reverse proxy.
   */
  origin?: string | ((request: IncomingMessage) => string);
};

export type FetchRequestHandler = (
  request: Request,
) => Response | Promise<Response>;

export type NodeNextFunction = (error?: unknown) => void;

export type NodeListener = (
  request: IncomingMessage,
  response: ServerResponse,
  next?: NodeNextFunction,
) => void;

export type NodeListenerOptions = ToWebRequestOptions & {
  /** Called when the Fetch handler or response stream fails. */
  onError?: (
    error: unknown,
    request: IncomingMessage,
    response: ServerResponse,
  ) => void;
};

const REQUEST_HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const RESPONSE_HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function resolveRequestOption(
  value: string | ((request: IncomingMessage) => string) | undefined,
  request: IncomingMessage,
  fallback: string,
): string {
  if (typeof value === "function") return value(request);
  return value ?? fallback;
}

/**
 * Converts a Node.js IncomingMessage into a Web-standard Request.
 *
 * This adapter works with Node HTTP servers and frameworks built on them,
 * including Express. Fetch-based runtimes can pass their Request directly.
 */
export function toWebRequest(
  request: IncomingMessage,
  options: ToWebRequestOptions = {},
): Request {
  const encrypted = Boolean(
    (request.socket as { encrypted?: boolean }).encrypted,
  );
  const defaultOrigin =
    (encrypted ? "https" : "http") +
    "://" +
    (request.headers.host ?? "localhost");
  const origin = new URL(
    resolveRequestOption(options.origin, request, defaultOrigin),
  ).origin;

  const expressOriginalUrl = (
    request as IncomingMessage & { originalUrl?: unknown }
  ).originalUrl;
  const defaultUrl =
    typeof expressOriginalUrl === "string" && expressOriginalUrl.length > 0
      ? expressOriginalUrl
      : (request.url ?? "/");
  const requestUrl = resolveRequestOption(options.url, request, defaultUrl);

  const headers = new Headers();
  const connection = request.headers.connection;
  const connectionHeaders = Array.isArray(connection)
    ? connection.join(",")
    : (connection ?? "");

  const hopByHopHeaders = new Set(REQUEST_HOP_BY_HOP_HEADERS);
  for (const name of connectionHeaders.split(",")) {
    const normalized = name.trim().toLowerCase();
    if (normalized) hopByHopHeaders.add(normalized);
  }

  for (const [key, value] of Object.entries(request.headers)) {
    if (hopByHopHeaders.has(key.toLowerCase())) continue;
    if (value === undefined) continue;

    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else {
      headers.set(key, value);
    }
  }

  const method = request.method ?? "GET";
  const init: RequestInit & { duplex?: "half" } = { method, headers };

  if (method !== "GET" && method !== "HEAD") {
    init.body = Readable.toWeb(request) as ReadableStream<Uint8Array>;
    init.duplex = "half";
  }

  return new Request(new URL(requestUrl, origin), init);
}

function waitForDrain(response: ServerResponse): Promise<void> {
  if (response.destroyed) {
    return Promise.reject(
      new Error("The client disconnected during the response stream."),
    );
  }

  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      response.off("drain", onDrain);
      response.off("close", onClose);
      response.off("error", onError);
    };

    const onDrain = () => {
      cleanup();
      resolve();
    };

    const onClose = () => {
      cleanup();
      reject(new Error("The client disconnected during the response stream."));
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    response.once("drain", onDrain);
    response.once("close", onClose);
    response.once("error", onError);

    if (response.destroyed) onClose();
  });
}

/**
 * Writes a Web Response to a Node ServerResponse, preserving streaming and
 * waiting for Node's drain event when the writable buffer fills.
 */
export async function writeResponse(
  target: ServerResponse,
  response: Response,
  requestMethod = "GET",
): Promise<void> {
  target.statusCode = response.status;

  const connection = response.headers.get("connection") ?? "";
  const hopByHopHeaders = new Set(RESPONSE_HOP_BY_HOP_HEADERS);

  for (const name of connection.split(",")) {
    const normalized = name.trim().toLowerCase();
    if (normalized) hopByHopHeaders.add(normalized);
  }

  const getSetCookie = (
    response.headers as Headers & { getSetCookie?: () => string[] }
  ).getSetCookie;
  const cookies = getSetCookie?.call(response.headers) ?? [];

  if (cookies.length > 0) {
    target.setHeader("set-cookie", cookies);
  }

  response.headers.forEach((value, key) => {
    const normalized = key.toLowerCase();
    if (normalized === "set-cookie" && cookies.length > 0) return;
    if (!hopByHopHeaders.has(normalized)) {
      target.setHeader(key, value);
    }
  });

  if (!response.body || requestMethod === "HEAD") {
    if (requestMethod === "HEAD" && response.body) {
      await response.body.cancel();
    }
    target.end();
    return;
  }

  const reader = response.body.getReader();
  const cancelOnClose = () => {
    if (!target.writableEnded) {
      void reader.cancel().catch(() => undefined);
    }
  };

  target.once("close", cancelOnClose);

  try {
    while (!target.destroyed) {
      const { done, value } = await reader.read();
      if (done) break;

      const canContinue = target.write(value);

      // Compression middleware buffers compressed output unless each SSR
      // chunk is explicitly flushed.
      (target as ServerResponse & { flush?: () => void }).flush?.();

      if (!canContinue) {
        await waitForDrain(target);
      }
    }

    if (!target.destroyed) target.end();
  } finally {
    target.off("close", cancelOnClose);

    if (target.destroyed) {
      await reader.cancel().catch(() => undefined);
    }

    reader.releaseLock();
  }
}

/**
 * Creates a Node request listener for a Fetch-compatible request handler.
 *
 * The returned function can be passed to node:http.createServer() or
 * mounted directly with Express's app.use().
 */
export function createListener(
  handler: FetchRequestHandler,
  options: NodeListenerOptions = {},
): NodeListener {
  return (request, response, next) => {
    void (async () => {
      const webRequest = toWebRequest(request, options);
      const webResponse = await handler(webRequest);

      if (!(webResponse instanceof Response)) {
        throw new TypeError("A Vynn Node listener must return a Web Response.");
      }

      await writeResponse(response, webResponse, request.method ?? "GET");
    })().catch((error: unknown) => {
      try {
        options.onError?.(error, request, response);
      } catch {
        // An error-reporting callback must not cause an unhandled rejection.
      }

      if (next) {
        next(error);
        return;
      }

      if (response.destroyed || response.writableEnded) return;

      if (response.headersSent) {
        response.destroy(error instanceof Error ? error : undefined);
        return;
      }

      response.statusCode = 500;
      response.setHeader("content-type", "text/plain; charset=utf-8");
      response.end("Internal Server Error");
    });
  };
}
