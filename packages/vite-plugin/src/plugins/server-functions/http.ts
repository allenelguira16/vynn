import type { IncomingMessage, ServerResponse } from "node:http";
import { MAX_REQUEST_BYTES } from "./shared.ts";

export async function readLimitedBody(
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

export function createServerFunctionRequest(
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
export function sendJson(
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
