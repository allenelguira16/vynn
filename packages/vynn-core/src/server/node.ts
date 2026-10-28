import type { IncomingMessage } from "node:http";
import { Readable } from "node:stream";

export type ToWebRequestOptions = {
  /**
   * The incoming request URL or path. Defaults to req.url.
   *
   * Pass Express's req.originalUrl when using Express so mounted routers do
   * not accidentally remove part of the URL.
   */
  url?: string;
  /**
   * The public origin used to resolve relative request URLs.
   *
   * Set this explicitly when running behind a reverse proxy. If omitted, the
   * protocol is inferred from the socket and the host from the Host header.
   */
  origin?: string;
};

/**
 * Converts a Node.js IncomingMessage into a Web-standard Request.
 *
 * This adapter is intended for Node.js HTTP servers and frameworks built on
 * them, such as Express. Bun.serve(), Deno.serve(), and Fetch-based frameworks
 * can pass their existing Request objects directly to Vynn.
 */
export function toWebRequest(
  req: IncomingMessage,
  options: ToWebRequestOptions = {},
): Request {
  const encrypted = Boolean(
    (req.socket as { encrypted?: boolean }).encrypted,
  );
  const defaultOrigin = `${encrypted ? "https" : "http"}://${req.headers.host ?? "localhost"}`;
  const origin = new URL(options.origin ?? defaultOrigin).origin;
  const requestUrl = options.url ?? req.url ?? "/";
  const headers = new Headers();
  const hopByHopHeaders = new Set([
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

  // Connection can nominate additional hop-by-hop headers.
  for (const name of (req.headers.connection ?? "").split(",")) {
    const normalized = name.trim().toLowerCase();
    if (normalized) hopByHopHeaders.add(normalized);
  }

  for (const [key, value] of Object.entries(req.headers)) {
    if (hopByHopHeaders.has(key.toLowerCase())) continue;
    if (value === undefined) continue;

    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else {
      headers.set(key, value);
    }
  }

  const method = req.method ?? "GET";
  const init: RequestInit & { duplex?: "half" } = { method, headers };

  if (method !== "GET" && method !== "HEAD") {
    init.body = Readable.toWeb(req) as ReadableStream<Uint8Array>;
    init.duplex = "half";
  }

  return new Request(new URL(requestUrl, origin), init);
}
