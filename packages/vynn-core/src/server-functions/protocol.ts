import type { ServerFunctionErrorData } from "./errors.ts";

export {
  DEFAULT_SERVER_FUNCTION_ENDPOINT,
  DEFAULT_MAX_SERVER_FUNCTION_REQUEST_BYTES,
  MAX_SERVER_FUNCTION_REQUEST_BYTES,
  SERVER_FUNCTION_ID_RE,
} from "./constants.ts";

export type ServerFunctionRequestPayload = {
  version?: 1;
  id: string;
  args: unknown;
  captures?: unknown;
};

export type ServerFunctionSuccessPayload = {
  version?: 1;
  ok: true;
  value?: unknown;
};

export type ServerFunctionErrorPayload = {
  version?: 1;
  ok: false;
  error: string | ServerFunctionErrorData;
};

export function createServerFunctionResponse(
  status: number,
  payload: ServerFunctionSuccessPayload | ServerFunctionErrorPayload,
  responseHeaders?: HeadersInit,
): Response {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });

  if (responseHeaders) {
    const source = new Headers(responseHeaders);
    const getSetCookie = (source as Headers & { getSetCookie?: () => string[] }).getSetCookie;
    const cookies = typeof getSetCookie === "function" ? getSetCookie.call(source) : [];

    source.forEach((value, name) => {
      if (name.toLowerCase() !== "set-cookie") headers.set(name, value);
    });

    for (const cookie of cookies) headers.append("set-cookie", cookie);
    if (cookies.length === 0 && source.has("set-cookie")) {
      headers.append("set-cookie", source.get("set-cookie") ?? "");
    }
  }

  // RPC responses must never be cached or interpreted as anything but JSON.
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");

  return new Response(JSON.stringify(payload), { status, headers });
}

export function normalizeServerFunctionOrigin(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("[Vynn server functions] Invalid allowed origin: " + value);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("[Vynn server functions] Allowed origins must use http or https: " + value);
  }

  return parsed.origin;
}

export function isAllowedServerFunctionOrigin(
  origin: string | null,
  requestUrl: string,
  allowedOrigins: ReadonlySet<string>,
): boolean {
  if (!origin) return false;

  try {
    const parsed = new URL(origin);
    if (parsed.origin !== origin) return false;

    return parsed.origin === new URL(requestUrl).origin || allowedOrigins.has(parsed.origin);
  } catch {
    return false;
  }
}
