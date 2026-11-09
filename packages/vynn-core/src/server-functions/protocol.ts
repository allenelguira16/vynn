export {
  DEFAULT_SERVER_FUNCTION_ENDPOINT,
  DEFAULT_MAX_SERVER_FUNCTION_REQUEST_BYTES,
  MAX_SERVER_FUNCTION_REQUEST_BYTES,
  SERVER_FUNCTION_ID_RE,
} from "./constants.ts";

export type ServerFunctionRequestPayload = {
  id: string;
  args: unknown[];
};

export type ServerFunctionSuccessPayload = {
  ok: true;
  value?: unknown;
};

export type ServerFunctionErrorPayload = {
  ok: false;
  error: string;
};

export function createServerFunctionResponse(
  status: number,
  payload: ServerFunctionSuccessPayload | ServerFunctionErrorPayload,
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
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
