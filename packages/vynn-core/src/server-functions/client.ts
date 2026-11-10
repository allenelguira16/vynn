import { DEFAULT_SERVER_FUNCTION_ENDPOINT } from "./constants.ts";
import { ServerFunctionError, type ServerFunctionErrorData } from "./errors.ts";
import { SERVER_FUNCTION_INVOKE, type ServerFunctionInvocationOptions } from "./invocation.ts";
import { deserializeServerFunctionValue, serializeServerFunctionValue } from "./serialization.ts";

export type ClientServerFunctionOptions = {
  /** Absolute pathname for the server-function RPC endpoint. */
  endpoint?: string;
  /** Reads lexical captures immediately before each RPC invocation. */
  getCaptures?: () => unknown[];
};

export type ClientServerFunctionCaptureProvider = () => unknown[];

const FALLBACK_SERVER_FUNCTION_ENDPOINT = "/__vynn/server-function";

export type ServerFunction = (...args: never[]) => unknown;

type ClientServerFunctionPayload = {
  version?: number;
  ok?: unknown;
  value?: unknown;
  error?: string | ServerFunctionErrorData;
};

function toServerFunctionError(
  payload: ClientServerFunctionPayload | undefined,
  status: number,
): Error {
  const error = payload?.error;

  if (
    payload?.version === 1 &&
    error !== null &&
    typeof error === "object" &&
    typeof error.message === "string" &&
    typeof error.status === "number" &&
    typeof error.code === "string"
  ) {
    let details = error.details;
    if (details !== undefined) {
      try {
        details = deserializeServerFunctionValue(details);
      } catch {
        details = undefined;
      }
    }

    return ServerFunctionError.from({
      name: typeof error.name === "string" ? error.name : "ServerFunctionError",
      message: error.message,
      code: error.code,
      status: error.status,
      ...(details === undefined ? {} : { details }),
    });
  }

  if (typeof error === "string") return new Error(error);

  return new Error("Vynn server function request failed (" + status + ").");
}

/**
 * Creates a callable client reference for a server function.
 *
 * The returned function sends typed, versioned RPC values to the configured
 * endpoint. invokeServerFunction() can attach a per-call AbortSignal.
 */
export function createServerReference<T extends ServerFunction>(
  id: string,
  options: ClientServerFunctionOptions | ClientServerFunctionCaptureProvider = {},
): T {
  if (!/^vynn_[a-f0-9]{20}$/.test(id)) {
    throw new TypeError("[Vynn] Invalid server-function ID.");
  }

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

  const invoke = async (
    args: unknown[],
    invocationOptions: ServerFunctionInvocationOptions = {},
  ): Promise<unknown> => {
    const captures = normalizedOptions.getCaptures?.() ?? [];
    if (!Array.isArray(captures)) {
      throw new TypeError("[Vynn] Server-function captures must be an array.");
    }
    if (captures.length > 100) {
      throw new RangeError("[Vynn] Server functions support at most 100 captured values.");
    }

    const response = await fetch(endpoint, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        version: 1,
        id,
        args: serializeServerFunctionValue(args),
        captures: serializeServerFunctionValue(captures),
      }),
      signal: invocationOptions.signal,
    });

    let payload: ClientServerFunctionPayload | undefined;
    try {
      payload = (await response.json()) as ClientServerFunctionPayload;
    } catch {
      payload = undefined;
    }

    if (!response.ok || payload?.ok !== true) {
      throw toServerFunctionError(payload, response.status);
    }

    return payload.version === 1 ? deserializeServerFunctionValue(payload.value) : payload.value;
  };

  const reference = (...args: unknown[]): Promise<unknown> => invoke(args);

  Object.defineProperty(reference, "name", { value: "serverReference" });
  Object.defineProperty(reference, SERVER_FUNCTION_INVOKE, { value: invoke });

  return reference as unknown as T;
}

export { invokeServerFunction, type ServerFunctionInvocationOptions } from "./invocation.ts";
export {
  registerServerFunctionCodec,
  serializeServerFunctionValue,
  deserializeServerFunctionValue,
  type ServerFunctionCodec,
} from "./serialization.ts";
export { ServerFunctionError };
export type { ServerFunctionErrorData, ServerFunctionErrorOptions } from "./errors.ts";
