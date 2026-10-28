import type { IncomingMessage, ServerResponse } from "node:http";
import { isAbsolute, relative, sep } from "node:path";
import { CLIENT_ENTRY_ID, type ResolvedEntries } from "./shared.ts";
import { DEV_CSS_URL } from "./documents.ts";
import { Readable } from "node:stream";

export function getClientEntryDevUrl(
  entries: ResolvedEntries,
  root: string,
  base: string,
): string {
  if (entries.clientFile) {
    return joinAssetBase(base, toDevUrl(root, entries.clientFile));
  }
  return joinAssetBase(base, `/@id/__x00__${CLIENT_ENTRY_ID}`);
}

export function toDevUrl(root: string, file: string): string {
  const rel = relative(root, file);
  if (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel)) {
    return `/${rel.replace(/\\/g, "/")}`;
  }
  return `/@fs/${file.replace(/\\/g, "/")}`;
}

export function joinAssetBase(base: string, pathname: string): string {
  if (/^https?:\/\//.test(pathname)) return pathname;
  const cleanPath = `/${pathname.replace(/^\/+/, "")}`;
  if (base === "./") return `.${cleanPath}`;
  if (/^https?:\/\//.test(base))
    return `${base.replace(/\/$/, "")}${cleanPath}`;
  const prefix = base === "/" ? "" : `/${base.replace(/^\/+|\/+$/g, "")}`;
  return `${prefix}${cleanPath}`;
}

export function addBaseToRequestUrl(base: string, incomingUrl: string): string {
  const parsed = new URL(incomingUrl, "http://vynn.local");
  const pathname = parsed.pathname;
  const basePath = base.startsWith("/") ? base.replace(/\/$/, "") : "";
  const alreadyPrefixed =
    !basePath || pathname === basePath || pathname.startsWith(`${basePath}/`);
  const path = alreadyPrefixed
    ? pathname
    : `${basePath}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
  return `${path || "/"}${parsed.search}`;
}

export function isHtmlNavigation(req: IncomingMessage): boolean {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  const accept = req.headers.accept;
  return (
    !accept ||
    accept.includes("text/html") ||
    accept.includes("application/xhtml+xml") ||
    accept.includes("*/*")
  );
}

export function isFrameworkRequest(url: string): boolean {
  const pathname = new URL(url, "http://vynn.local").pathname;
  return (
    pathname.startsWith("/@") ||
    pathname === DEV_CSS_URL ||
    pathname === "/favicon.ico"
  );
}

export function createWebRequest(
  req: IncomingMessage,
  requestUrl: string,
): Request {
  const encrypted = Boolean((req.socket as { encrypted?: boolean }).encrypted);
  const origin = `${encrypted ? "https" : "http"}://${req.headers.host ?? "localhost"}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else if (value !== undefined) {
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

export async function writeResponse(
  res: ServerResponse,
  response: Response,
): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    // The Node server owns transfer-encoding and computes lengths for bodies.
    if (
      key.toLowerCase() !== "content-length" &&
      key.toLowerCase() !== "transfer-encoding"
    ) {
      res.setHeader(key, value);
    }
  });

  if (!response.body) {
    res.end();
    return;
  }

  const reader = response.body.getReader();
  const cancelOnClose = () => {
    if (!res.writableEnded) void reader.cancel().catch(() => undefined);
  };
  res.once("close", cancelOnClose);

  try {
    while (!res.destroyed) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!res.write(value)) {
        await new Promise<void>((resolveDrain, reject) => {
          const cleanup = () => {
            res.off("drain", onDrain);
            res.off("close", onClose);
            res.off("error", onError);
          };
          const onDrain = () => {
            cleanup();
            resolveDrain();
          };
          const onClose = () => {
            cleanup();
            reject(new Error("Client disconnected during Vynn SSR."));
          };
          const onError = (error: Error) => {
            cleanup();
            reject(error);
          };
          res.once("drain", onDrain);
          res.once("close", onClose);
          res.once("error", onError);
        });
      }
    }
    if (!res.destroyed) res.end();
  } finally {
    res.off("close", cancelOnClose);
    if (res.destroyed) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
