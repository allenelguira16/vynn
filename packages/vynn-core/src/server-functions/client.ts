import { DEFAULT_SERVER_FUNCTION_ENDPOINT } from "./constants.ts";

export type ClientServerFunctionOptions = {
  /** Absolute pathname for the server-function RPC endpoint. */
  endpoint?: string;
  /** Reads lexical captures immediately before each RPC invocation. */
  getCaptures?: () => unknown[];
};

export type ClientServerFunctionCaptureProvider = () => unknown[];

const FALLBACK_SERVER_FUNCTION_ENDPOINT = "/__vynn/server-function";

export type ServerFunction = (...args: never[]) => unknown;

function serializeCaptures(captures: unknown[]): unknown[] {
  if (!Array.isArray(captures)) {
    throw new TypeError("[Vynn] Server-function captures must be an array.");
  }

  if (captures.length > 100) {
    throw new RangeError("[Vynn] Server functions support at most 100 captured values.");
  }

  let serialized: string;

  try {
    const result = JSON.stringify(captures, (_key, value: unknown) => {
      if (
        value === undefined ||
        typeof value === "function" ||
        typeof value === "symbol" ||
        typeof value === "bigint"
      ) {
        throw new TypeError(
          "[Vynn] Server-function captures must contain only JSON-serializable values.",
        );
      }

      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        const prototype = Object.getPrototypeOf(value);
        if (prototype !== Object.prototype && prototype !== null) {
          throw new TypeError(
            "[Vynn] Server-function captures must be plain objects or arrays.",
          );
        }
      }

      return value;
    });

    if (typeof result !== "string") {
      throw new TypeError("[Vynn] Server-function captures could not be serialized.");
    }

    serialized = result;
  } catch (error) {
    if (error instanceof TypeError && error.message.startsWith("[Vynn]")) throw error;
    throw new TypeError(
      "[Vynn] Could not serialize server-function captures. Use plain JSON data.",
      { cause: error },
    );
  }

  return JSON.parse(serialized) as unknown[];
}

/**
 * Creates a callable client reference for a server function.
 *
 * The returned function sends JSON arguments to the configured endpoint and
 * resolves with the JSON-serializable return value.
 */
export function createServerReference<T extends ServerFunction>(
  id: string,
  options: ClientServerFunctionOptions | ClientServerFunctionCaptureProvider = {},
): T {
  if (!/^vynn_[a-f0-9]{20}$/.test(id)) {
    throw new TypeError("[Vynn] Invalid server-function ID.");
  }

  // Compiler-only transforms can target this runtime directly, without the
  // Vite virtual wrapper. Accept their capture-provider shorthand as well as
  // the normal options object so an options-signature mismatch never turns
  // the RPC URL into undefined.
  const normalizedOptions: ClientServerFunctionOptions =
    typeof options === "function" ? { getCaptures: options } : options;
  const configuredEndpoint = normalizedOptions.endpoint;
  const endpoint =
    typeof configuredEndpoint === "string" && configuredEndpoint.length > 0
      ? configuredEndpoint
      : DEFAULT_SERVER_FUNCTION_ENDPOINT || FALLBACK_SERVER_FUNCTION_ENDPOINT;

  if (typeof endpoint !== "string" || endpoint.length === 0) {
    throw new Error("[Vynn] No server-function endpoint is configured.");
  }

  const reference = async (...args: unknown[]): Promise<unknown> => {
    const captures = serializeCaptures(normalizedOptions.getCaptures?.() ?? []);
    const response = await fetch(endpoint, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ id, args, captures }),
    });

    let payload: { ok?: unknown; value?: unknown; error?: unknown } | undefined;
    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      payload = undefined;
    }

    if (!response.ok || payload?.ok !== true) {
      throw new Error(
        typeof payload?.error === "string"
          ? payload.error
          : `Vynn server function request failed (${response.status}).`,
      );
    }

    return payload.value;
  };

  Object.defineProperty(reference, "name", { value: "serverReference" });
  return reference as unknown as T;
}
