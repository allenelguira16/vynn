import { DEFAULT_SERVER_FUNCTION_ENDPOINT } from "./constants.ts";

export type ClientServerFunctionOptions = {
  /** Absolute pathname for the server-function RPC endpoint. */
  endpoint?: string;
};

export type ServerFunction = (...args: never[]) => unknown;

/**
 * Creates a callable client reference for a server function.
 *
 * The returned function sends JSON arguments to the configured endpoint and
 * resolves with the JSON-serializable return value.
 */
export function createServerReference<T extends ServerFunction>(
  id: string,
  options: ClientServerFunctionOptions = {},
): T {
  if (!/^vynn_[a-f0-9]{20}$/.test(id)) {
    throw new TypeError("[Vynn] Invalid server-function ID.");
  }

  const endpoint = options.endpoint ?? DEFAULT_SERVER_FUNCTION_ENDPOINT;

  const reference = async (...args: unknown[]): Promise<unknown> => {
    const response = await fetch(endpoint, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ id, args }),
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
