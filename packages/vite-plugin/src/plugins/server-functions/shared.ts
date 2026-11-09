import type { Plugin } from "vite";

export type Node = any;

export type ServerFunctionReference = {
  id: string;
  moduleId: string;
  exportName: string;
};

export type VynnServerFunctionsOptions = {
  /** HTTP endpoint called by client-side server references. Must be an absolute pathname. */
  endpoint?: string;
  /** Disable the transform while keeping the plugin registered. */
  enabled?: boolean;
  /** Maximum request body size in bytes. Defaults to 1 MiB. */
  maxRequestBytes?: number;
  /** Additional trusted browser origins, for apps behind a reverse proxy. Exact origins only. */
  allowedOrigins?: string[];
  /** Include thrown error messages in RPC responses. Defaults to true in dev and false in builds. */
  exposeErrors?: boolean;
};

export type VynnServerFunctionsPlugin = Plugin & {
  /** Current server-function manifest. Useful for production integration. */
  getServerFunctions(): ServerFunctionReference[];
};

export const CLIENT_RUNTIME_ID = "virtual:vynn/server-functions/client-runtime";
export const SERVER_RUNTIME_ID = "virtual:vynn/server-functions/server-runtime";
export const SERVER_FUNCTIONS_API_ID = "virtual:vynn/server-functions";
export const RESOLVED_CLIENT_RUNTIME_ID = `\0${CLIENT_RUNTIME_ID}`;
export const RESOLVED_SERVER_RUNTIME_ID = `\0${SERVER_RUNTIME_ID}`;
export const RESOLVED_SERVER_FUNCTIONS_API_ID = `\0${SERVER_FUNCTIONS_API_ID}`;
export const SERVER_FUNCTION_IMPL_PREFIX = "virtual:vynn/server-functions/implementation/";
export const RESOLVED_SERVER_FUNCTION_IMPL_PREFIX = `\0${SERVER_FUNCTION_IMPL_PREFIX}`;
export const SERVER_FUNCTION_MANIFEST_SENTINEL = "__VYNN_SERVER_FUNCTION_MANIFEST__";

/**
 * Must match DEFAULT_SERVER_FUNCTION_ENDPOINT in vynn-core.
 *
 * Kept local to the Vite integration so the framework does not need to expose
 * an implementation constant as a public package subpath.
 */
export const DEFAULT_ENDPOINT = "/__vynn/server-function";
export function applyBaseToEndpoint(base: string, endpoint: string): string {
  if (base === "/" || base === "./") return endpoint;
  const prefix = base.startsWith("/") ? base.replace(/\/+$/, "") : "";
  return prefix ? `${prefix}${endpoint}` : endpoint;
}

export function normalizeAllowedOrigin(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("[Vynn use server] Invalid allowed origin: " + value);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    throw new Error("[Vynn use server] Allowed origins must use http or https: " + value);
  return parsed.origin;
}
