export type ServerFunctionErrorOptions = {
  /** Stable machine-readable error code. */
  code?: string;
  /** HTTP status returned to the client. Must be between 400 and 599. */
  status?: number;
  /** Optional structured details safe to expose to the caller. */
  details?: unknown;
  /** Original error when rethrowing or wrapping another failure. */
  cause?: unknown;
};

export type ServerFunctionErrorData = {
  name: string;
  message: string;
  code: string;
  status: number;
  details?: unknown;
};

/**
 * An application error that is intentionally safe to expose across the
 * server-function boundary.
 *
 * Ordinary thrown errors remain private in production. Use this class when a
 * client needs a stable error code, HTTP status, or structured details.
 */
export class ServerFunctionError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, options: ServerFunctionErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "ServerFunctionError";
    this.code = options.code ?? "SERVER_FUNCTION_ERROR";
    this.status = options.status ?? 500;
    this.details = options.details;

    if (!Number.isInteger(this.status) || this.status < 400 || this.status > 599) {
      throw new RangeError("[Vynn] Server-function error status must be an integer between 400 and 599.");
    }

    if (!/^[A-Z0-9_]+$/.test(this.code)) {
      throw new TypeError("[Vynn] Server-function error codes must contain uppercase letters, numbers, and underscores.");
    }
  }

  static from(data: ServerFunctionErrorData): ServerFunctionError {
    const error = new ServerFunctionError(data.message, {
      code: data.code,
      status: data.status,
      details: data.details,
    });
    error.name = data.name || "ServerFunctionError";
    return error;
  }
}
