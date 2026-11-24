import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";

import type { Transform } from "node:stream";
import { isAbsolute, relative, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import { constants as zlibConstants, createBrotliCompress, createGzip } from "node:zlib";

import { toWebRequest } from "vynn/server/node";

import { VYNN_SSR_CSS_URL } from "../ssr-css.ts";
import { CLIENT_ENTRY_ID, type ResolvedEntries } from "./shared.ts";

export function getClientEntryDevUrl(entries: ResolvedEntries, root: string, base: string): string {
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
  if (/^https?:\/\//.test(base)) return `${base.replace(/\/$/, "")}${cleanPath}`;
  const prefix = base === "/" ? "" : `/${base.replace(/^\/+|\/+$/g, "")}`;
  return `${prefix}${cleanPath}`;
}

export function addBaseToRequestUrl(base: string, incomingUrl: string): string {
  const parsed = new URL(incomingUrl, "http://vynn.local");
  const pathname = parsed.pathname;
  const basePath = base.startsWith("/") ? base.replace(/\/$/, "") : "";
  const alreadyPrefixed = !basePath || pathname === basePath || pathname.startsWith(`${basePath}/`);
  const path = alreadyPrefixed
    ? pathname
    : `${basePath}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
  return `${path || "/"}${parsed.search}`;
}

// Social preview crawlers often request documents with Accept: */* and do not
// send the Fetch Metadata headers browsers use to identify navigations.
const SOCIAL_PREVIEW_CRAWLER_USER_AGENT =
  /facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|discordbot|telegrambot|whatsapp|pinterestbot/i;

export function isHtmlNavigation(req: IncomingMessage): boolean {
  if (req.method !== "GET" && req.method !== "HEAD") return false;

  // Fetch Metadata is more reliable than Accept for browsers: subresources
  // can advertise */* (and occasionally text/html) without being documents.
  const destination = req.headers["sec-fetch-dest"];
  if (destination && !["document", "iframe", "frame"].includes(destination)) {
    return false;
  }

  const accept = req.headers.accept;
  const userAgent = req.headers["user-agent"] ?? "";
  const isSocialPreviewCrawler =
    SOCIAL_PREVIEW_CRAWLER_USER_AGENT.test(userAgent) && !!accept?.includes("*/*");

  return (
    destination === "document" ||
    destination === "iframe" ||
    destination === "frame" ||
    !accept ||
    accept.includes("text/html") ||
    accept.includes("application/xhtml+xml") ||
    isSocialPreviewCrawler
  );
}

export function isFrameworkRequest(url: string): boolean {
  const pathname = new URL(url, "http://vynn.local").pathname;
  return pathname.startsWith("/@") || pathname === VYNN_SSR_CSS_URL || pathname === "/favicon.ico";
}

/**
 * Identifies Web Response objects across JavaScript realms.
 *
 * Vite's SSR Module Runner can produce a Response whose constructor differs
 * from the host server's global Response, so instanceof is not reliable at
 * the middleware boundary.
 */
export function isWebResponse(value: unknown): value is Response {
  if (typeof value !== "object" || value === null) return false;

  const candidate = value as {
    status?: unknown;
    headers?: { forEach?: unknown };
    body?: { getReader?: unknown } | null;
    arrayBuffer?: unknown;
  };

  return (
    typeof candidate.status === "number" &&
    typeof candidate.headers?.forEach === "function" &&
    "body" in value &&
    (candidate.body === null ||
      (typeof candidate.body === "object" &&
        candidate.body !== null &&
        typeof candidate.body.getReader === "function")) &&
    typeof candidate.arrayBuffer === "function"
  );
}

export function createWebRequest(req: IncomingMessage, requestUrl: string): Request {
  return toWebRequest(req, { url: requestUrl });
}

export type ResponseCompressionEncoding = "br" | "gzip";

const compressibleResponseMime = /text|javascript|\/json|xml/i;
const responseCompressionThreshold = 1024;

/** Select the best supported encoding advertised by the request. */
export function negotiateResponseEncoding(
  acceptEncoding: string | undefined,
): ResponseCompressionEncoding | null {
  if (!acceptEncoding) return null;

  const qualities = new Map<string, number>();
  for (const item of acceptEncoding.split(",")) {
    const [rawEncoding, ...parameters] = item.trim().toLowerCase().split(";");
    if (!rawEncoding) continue;

    const qualityParameter = parameters.find((parameter) => parameter.trim().startsWith("q="));
    const qualityValue = qualityParameter ? Number(qualityParameter.trim().slice(2)) : 1;
    const quality =
      Number.isFinite(qualityValue) && qualityValue >= 0 && qualityValue <= 1 ? qualityValue : 0;

    qualities.set(rawEncoding, quality);
  }

  const qualityFor = (encoding: ResponseCompressionEncoding): number =>
    qualities.get(encoding) ?? qualities.get("*") ?? 0;
  const brotliQuality = qualityFor("br");
  const gzipQuality = qualityFor("gzip");

  if (brotliQuality <= 0 && gzipQuality <= 0) return null;
  return brotliQuality >= gzipQuality && brotliQuality > 0 ? "br" : "gzip";
}

function getResponseCompression(
  response: Response,
  acceptEncoding: string | undefined,
): ResponseCompressionEncoding | null {
  const encoding = negotiateResponseEncoding(acceptEncoding);
  const contentType = response.headers.get("content-type") ?? "";

  if (
    !encoding ||
    !response.body ||
    response.status === 204 ||
    response.status === 205 ||
    response.status === 206 ||
    response.status === 304 ||
    response.headers.has("content-encoding") ||
    response.headers.has("content-range") ||
    /\bno-transform\b/i.test(response.headers.get("cache-control") ?? "") ||
    /^text\/event-stream\b/i.test(contentType)
  ) {
    return null;
  }

  if (!compressibleResponseMime.test(contentType)) return null;

  const contentLengthHeader = response.headers.get("content-length");
  const contentLength = contentLengthHeader === null ? null : Number(contentLengthHeader);
  if (
    contentLength !== null &&
    Number.isFinite(contentLength) &&
    contentLength < responseCompressionThreshold
  ) {
    return null;
  }

  return encoding;
}

function appendVaryHeader(res: ServerResponse, value: string): void {
  const current = res.getHeader("Vary");
  const entries = (Array.isArray(current) ? current : current === undefined ? [] : [current])
    .flatMap((entry) => String(entry).split(","))
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (
    entries.includes("*") ||
    entries.some((entry) => entry.toLowerCase() === value.toLowerCase())
  ) {
    return;
  }

  res.setHeader("Vary", [...entries, value].join(", "));
}

function waitForCompressorDrain(
  compressor: Transform,
  res: ServerResponse,
): Promise<void> {
  if (compressor.destroyed || res.destroyed) return Promise.resolve();

  return new Promise<void>((resolveDrain, rejectDrain) => {
    let settled = false;
    const cleanup = () => {
      compressor.off("drain", onDrain);
      compressor.off("close", onClose);
      compressor.off("error", onError);
      res.off("close", onResponseClose);
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) rejectDrain(error);
      else resolveDrain();
    };
    const onDrain = () => finish();
    const onClose = () => finish();
    const onResponseClose = () => finish();
    const onError = (error: Error) => finish(error);

    compressor.once("drain", onDrain);
    compressor.once("close", onClose);
    compressor.once("error", onError);
    res.once("close", onResponseClose);

    if (compressor.destroyed || res.destroyed) finish();
  });
}

type FlushableTransform = Transform & {
  flush(kind: number, callback: (error?: Error | null) => void): void;
};

function flushCompressor(
  compressor: FlushableTransform,
  res: ServerResponse,
  flushMode: number,
): Promise<void> {
  if (compressor.destroyed || res.destroyed) return Promise.resolve();

  return new Promise<void>((resolveFlush, rejectFlush) => {
    let settled = false;
    const cleanup = () => {
      compressor.off("close", onClose);
      compressor.off("error", onError);
      res.off("close", onResponseClose);
    };
    const finish = (error?: Error | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) rejectFlush(error);
      else resolveFlush();
    };
    const onClose = () => finish();
    const onResponseClose = () => finish();
    const onError = (error: Error) => finish(error);
    const onFlush = (error?: Error | null) => finish(error);

    compressor.once("close", onClose);
    compressor.once("error", onError);
    res.once("close", onResponseClose);

    if (compressor.destroyed || res.destroyed) {
      finish();
      return;
    }

    try {
      compressor.flush(flushMode, onFlush);
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

async function writeCompressedResponse(
  res: ServerResponse,
  body: ReadableStream<Uint8Array>,
  encoding: ResponseCompressionEncoding,
): Promise<void> {
  const compressor = (
    encoding === "br"
      ? createBrotliCompress({
          params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 4 },
        })
      : createGzip()
  ) as FlushableTransform;
  const reader = body.getReader();
  const flushMode =
    encoding === "br" ? zlibConstants.BROTLI_OPERATION_FLUSH : zlibConstants.Z_SYNC_FLUSH;

  let clientDisconnected = false;
  let input: Promise<void> | undefined;
  let output: Promise<void> | undefined;

  const cancelOnClose = () => {
    if (res.writableFinished) return;

    clientDisconnected = !res.errored;
    void reader.cancel().catch(() => undefined);

    // A disconnected client is an expected cancellation, not a compressor
    // failure. Destroy without an error so it cannot become an unhandled
    // 'error' event after pipeline() has already settled.
    if (!compressor.destroyed) compressor.destroy();
  };

  res.once("close", cancelOnClose);

  try {
    // The response can be closed while the SSR handler is still producing its
    // Web Response. Do not attempt to pipe a compressor into a dead socket.
    if (res.destroyed || res.writableEnded) {
      clientDisconnected = res.destroyed && !res.writableFinished && !res.errored;
      await reader.cancel().catch(() => undefined);
      return;
    }

    // Vite's preview compression middleware wraps this response before Vynn's
    // post-hook runs. Content-Encoding is set before the first write so Vite
    // passes this already-compressed stream through instead of compressing it
    // again or making a decision from the first small SSR chunk.
    output = pipeline(compressor, res);
    input = (async () => {
      while (!res.destroyed && !res.writableEnded && !compressor.destroyed) {
        const { done, value } = await reader.read();
        if (done || res.destroyed || res.writableEnded || compressor.destroyed) break;

        if (!compressor.write(value)) {
          await waitForCompressorDrain(compressor, res);
          if (res.destroyed || res.writableEnded || compressor.destroyed) break;
        }

        // Flush each SSR chunk so the initial shell reaches the client without
        // waiting for the compressor's internal buffer to fill.
        await flushCompressor(compressor, res, flushMode);
      }

      if (!res.destroyed && !res.writableEnded && !compressor.destroyed) compressor.end();
    })();

    await Promise.all([input, output]);
  } catch (error) {
    // Reloading or navigating away closes the response while SSR is streaming.
    // Stop the source and compressor, but do not turn that expected abort into
    // an application error or a process-level stream error.
    if (!res.errored && (clientDisconnected || (res.destroyed && !res.writableFinished))) {
      await reader.cancel().catch(() => undefined);
      if (!compressor.destroyed) compressor.destroy();
      await Promise.allSettled([input ?? Promise.resolve(), output ?? Promise.resolve()]);
      return;
    }

    const cause = error instanceof Error ? error : new Error(String(error));
    if (!compressor.destroyed) compressor.destroy(cause);
    await reader.cancel(cause).catch(() => undefined);
    await Promise.allSettled([input ?? Promise.resolve(), output ?? Promise.resolve()]);
    if (!res.destroyed) res.destroy(cause);
    throw cause;
  } finally {
    res.off("close", cancelOnClose);
    if (res.destroyed) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export type WriteResponseOptions = {
  /** Request Accept-Encoding header. Omit to leave compression to the host server. */
  acceptEncoding?: string;
  /** Headers configured on the owning Vite server. Response headers override these defaults. */
  headers?: OutgoingHttpHeaders;
};

export async function writeResponse(
  res: ServerResponse,
  response: Response,
  options: WriteResponseOptions = {},
): Promise<void> {
  const compression = getResponseCompression(response, options.acceptEncoding);

  // Request cancellation can race with SSR completion. The response body still
  // belongs to this writer, so cancel it without touching an already-closed
  // ServerResponse.
  if (res.destroyed || res.writableEnded) {
    await response.body?.cancel().catch(() => undefined);
    return;
  }

  res.statusCode = response.status;

  for (const [key, value] of Object.entries(options.headers ?? {})) {
    if (value !== undefined) res.setHeader(key, value);
  }

  response.headers.forEach((value, key) => {
    // The Node server owns transfer-encoding and computes lengths for bodies.
    if (key.toLowerCase() !== "content-length" && key.toLowerCase() !== "transfer-encoding") {
      res.setHeader(key, value);
    }
  });

  if (compression) {
    res.setHeader("Content-Encoding", compression);
    res.removeHeader("Content-Length");
    appendVaryHeader(res, "Accept-Encoding");
  }

  if (!response.body) {
    res.end();
    return;
  }

  if (compression) {
    await writeCompressedResponse(res, response.body, compression);
    return;
  }

  const reader = response.body.getReader();
  const cancelOnClose = () => {
    if (!res.writableEnded) void reader.cancel().catch(() => undefined);
  };
  res.once("close", cancelOnClose);

  try {
    while (!res.destroyed && !res.writableEnded) {
      const { done, value } = await reader.read();
      if (done || res.destroyed || res.writableEnded) break;
      const canContinue = res.write(value);

      if (!canContinue) {
        await new Promise<void>((resolveDrain, rejectDrain) => {
          const cleanup = () => {
            res.off("drain", onDrain);
            res.off("close", onClose);
            res.off("error", onError);
          };
          const onDrain = () => {
            cleanup();
            resolveDrain();
          };
          // A closed response is a normal cancellation, not an SSR failure.
          const onClose = () => {
            cleanup();
            resolveDrain();
          };
          const onError = (error: Error) => {
            cleanup();
            rejectDrain(error);
          };
          res.once("drain", onDrain);
          res.once("close", onClose);
          res.once("error", onError);

          if (res.destroyed || res.writableEnded) {
            cleanup();
            resolveDrain();
          }
        });
      }
    }
    if (!res.destroyed && !res.writableEnded) res.end();
  } catch (error) {
    if (!res.destroyed && !res.writableEnded) throw error;
  } finally {
    res.off("close", cancelOnClose);
    if (res.destroyed) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
