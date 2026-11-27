import {
  applyRequestContextResponse,
  runWithRequestContext,
  type RequestContext,
} from "./function-context";

export type VynnMiddleware = (
  context: RequestContext,
  next: () => Promise<Response>,
) => Response | Promise<Response>;

export type VynnRequestHandler = (request: Request) => Response | Promise<Response>;

function isWebResponse(value: unknown): value is Response {
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

function isMiddleware(value: unknown): value is VynnMiddleware {
  return typeof value === "function";
}

/**
 * Composes the ordered middleware list around a Fetch-compatible request
 * handler. Each middleware must return a Response or the Response from next().
 */
export function createMiddlewareHandler(
  middleware: VynnMiddleware | readonly VynnMiddleware[] | null | undefined,
  handler: VynnRequestHandler,
): (request: Request) => Promise<Response> {
  const stack: VynnMiddleware[] =
    middleware == null
      ? []
      : typeof middleware === "function"
        ? [middleware]
        : [...middleware];

  if (!stack.every(isMiddleware)) {
    throw new TypeError("[Vynn] Middleware must be a function or an array of functions.");
  }

  return (request) =>
    runWithRequestContext(request, async (context) => {
      let lastIndex = -1;

      const dispatch = async (index: number): Promise<Response> => {
        if (index <= lastIndex) {
          throw new Error("[Vynn] Middleware called next() more than once.");
        }
        lastIndex = index;

        const current = stack[index];
        let response: unknown;

        try {
          response = current
            ? await current(context, () => dispatch(index + 1))
            : await handler(request);
        } catch (error) {
          // Throwing a Fetch Response is a convenient short-circuit for
          // redirects and other intentional HTTP responses.
          if (!isWebResponse(error)) throw error;
          response = error;
        }

        if (!isWebResponse(response)) {
          throw new TypeError(
            "[Vynn] Middleware and request handlers must return a Fetch Response. Return next() to continue the chain.",
          );
        }

        return response;
      };

      const response = await dispatch(0);
      return applyRequestContextResponse(response, context);
    });
}
